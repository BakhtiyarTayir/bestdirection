import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { canManageSession, responsibleTeacherId } from "./domain/attendance-access";
import type { TeacherAttendanceDto, TeacherReportQueryDto } from "./dto/attendance.dto";

const LOCALE_TAGS: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU" };

/**
 * Отчёт по преподавателям: сколько занятий числится, проведено, пропущено и
 * не отмечено. Перенесено из src/actions/attendance-actions.ts в web.
 *
 * Занятия без записанного ведущего (все, что были до появления отметки)
 * считаются по педагогу группы, а при его отсутствии — по педагогу курса.
 * Иначе вся история выпала бы из отчёта.
 */
@Injectable()
export class TeacherAttendanceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  private bounds(query: TeacherReportQueryDto) {
    const parse = (value?: string) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined);
    const from = parse(query.from);
    const to = parse(query.to);
    return from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
  }

  async report(query: TeacherReportQueryDto, user: SessionUser) {
    // Преподаватель видит только свою статистику, администратор — всю
    const teacherFilter = user.role === "TEACHER" ? user.id : query.teacherId;

    const sessions = await this.prisma.attendanceSession.findMany({
      // Курсы из Корзины не считаются: их занятия больше не ведутся, а
      // статистика преподавателя продолжала бы их учитывать
      where: { ...this.bounds(query), course: { deletedAt: null } },
      select: {
        id: true,
        date: true,
        teacherId: true,
        teacherStatus: true,
        group: { select: { id: true, name: true, teacherId: true } },
        course: { select: { id: true, title: true, teacherId: true } },
      },
      orderBy: { date: "desc" },
    });

    type Row = {
      teacherId: string;
      firstName: string;
      lastName: string;
      total: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      unmarked: number;
    };
    const rows = new Map<string, Row>();

    for (const session of sessions) {
      const responsibleId = responsibleTeacherId(session);
      if (!responsibleId) continue;
      if (teacherFilter && responsibleId !== teacherFilter) continue;

      let row = rows.get(responsibleId);
      if (!row) {
        row = {
          teacherId: responsibleId,
          firstName: "",
          lastName: "",
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          unmarked: 0,
        };
        rows.set(responsibleId, row);
      }

      row.total += 1;
      switch (session.teacherStatus) {
        case "PRESENT":
          row.present += 1;
          break;
        case "ABSENT":
          row.absent += 1;
          break;
        case "LATE":
          row.late += 1;
          break;
        case "EXCUSED":
          row.excused += 1;
          break;
        default:
          row.unmarked += 1;
      }
    }

    if (rows.size === 0) return [];

    // Без фильтра мягкого удаления: строка удалённого преподавателя иначе
    // осталась бы в отчёте с цифрами, но без имени
    const teachers = await this.prismaService.prismaUnscoped.user.findMany({
      where: { id: { in: [...rows.keys()] } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const teacher of teachers) {
      const row = rows.get(teacher.id);
      if (row) {
        row.firstName = teacher.firstName;
        row.lastName = teacher.lastName;
      }
    }

    const collator = new Intl.Collator(LOCALE_TAGS[query.locale] ?? LOCALE_TAGS.uz, {
      sensitivity: "base",
    });
    return [...rows.values()].sort((a, b) =>
      collator.compare(`${a.lastName}${a.firstName}`, `${b.lastName}${b.firstName}`)
    );
  }

  /**
   * Занятия периода с отметкой преподавателя — список под сводкой отчёта.
   * Сводка отвечает «сколько», этот список — «какие именно».
   */
  async sessions(query: TeacherReportQueryDto, user: SessionUser) {
    const teacherFilter = user.role === "TEACHER" ? user.id : query.teacherId;

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { course: { deletedAt: null }, ...this.bounds(query) },
      select: {
        id: true,
        date: true,
        teacherId: true,
        teacherStatus: true,
        teacherNote: true,
        group: { select: { name: true, teacherId: true } },
        course: { select: { title: true, slug: true, teacherId: true } },
      },
      orderBy: { date: "desc" },
      take: 200,
    });

    const rows = sessions
      .map((item) => ({ item, responsible: responsibleTeacherId(item) }))
      .filter(({ responsible }) => responsible !== null)
      .filter(({ responsible }) => !teacherFilter || responsible === teacherFilter);

    const teachers = await this.prismaService.prismaUnscoped.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.responsible as string))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(teachers.map((t) => [t.id, `${t.lastName} ${t.firstName}`]));

    return rows.map(({ item, responsible }) => ({
      id: item.id,
      date: item.date.toISOString(),
      courseTitle: item.course.title,
      courseSlug: item.course.slug,
      groupName: item.group?.name ?? null,
      teacherId: responsible as string,
      teacherName: nameById.get(responsible as string) ?? "",
      status: item.teacherStatus,
      note: item.teacherNote,
      // Ведущий ещё не записан: отметка проставит его явно
      teacherImplicit: item.teacherId === null,
    }));
  }

  /** Отметка преподавателя из отчёта. */
  async setAttendance(sessionId: string, data: TeacherAttendanceDto, actor: SessionUser) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        course: { select: { id: true, teacherId: true } },
        group: { select: { teacherId: true } },
      },
    });
    if (!session) throw new NotFoundException("sessionNotFound");
    if (!canManageSession(actor, session)) throw new NotFoundException("sessionNotFound");

    // У занятий, заведённых до появления отметки, ведущий пуст, и они числятся
    // за педагогом группы или курса. Отметка должна кому-то принадлежать,
    // поэтому при первой же записи ведущий фиксируется.
    const responsible = responsibleTeacherId(session);

    await this.prisma.attendanceSession.update({
      where: { id: sessionId },
      data: {
        ...(data.status !== undefined ? { teacherStatus: data.status } : {}),
        ...(data.note !== undefined ? { teacherNote: data.note } : {}),
        ...(session.teacherId === null && responsible ? { teacherId: responsible } : {}),
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "AttendanceSession",
      entityId: sessionId,
      action: "UPDATE",
      metadata: { teacherAttendance: true, teacherId: responsible, status: data.status ?? null },
    });
  }
}

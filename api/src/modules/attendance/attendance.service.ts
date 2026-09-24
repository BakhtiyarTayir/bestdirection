import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import { activeEnrollmentFilter } from "../billing/billing-ledger.service";
import { countLessons, currentDateKey, currentMonthKey, monthEnd, monthStart } from "../billing/domain/billing";
import { dateKeyOf, toDdMm } from "../dashboard/teacher-dashboard.service";
import { ParentNotifyService } from "../parent-notifications/parent-notify.service";
import { SalaryService } from "../salary/salary.service";
import { canManageCourseAttendance, canManageSession, responsibleTeacherId } from "./domain/attendance-access";
import type { AttendanceGroupsQueryDto, CreateSessionDto, UpdateRecordsDto } from "./dto/attendance.dto";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** Перенесено из src/actions/attendance-actions.ts в web. */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly salary: SalaryService,
    private readonly parentNotify: ParentNotifyService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Удалённого преподавателя обычный клиент прячет — в отчётах нужен и он. */
  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  /**
   * Занятия курса. Ученик видит занятия только своего курса и только свои
   * отметки: раньше любой вошедший получал отметки всех учеников с их email.
   *
   * groupId сужает выборку до журнала одной группы (план «Журнал
   * посещаемости по группам», п.1). С ним доступ уже, чем просто «свой
   * курс»: ученик — только своя группа, преподаватель — только её педагог
   * или педагог курса (та же лестница, что и на управление занятиями).
   */
  async sessions(courseId: string, user: SessionUser, groupId?: string) {
    const isStaff = user.role === "ADMIN" || user.role === "TEACHER";

    if (!isStaff) {
      if (user.role !== "STUDENT") throw new ForbiddenException("forbidden");
      // Отчисленный (billingEndsAt без группы) посещаемость курса не видит —
      // запись жива только ради истории начислений
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { studentId: user.id, courseId, ...activeEnrollmentFilter() },
        select: { id: true, groupId: true },
      });
      if (!enrollment) throw new ForbiddenException("forbidden");
      // Чужую группу курса не отдаём даже с пустыми (не своими) отметками —
      // иначе через URL утекли бы даты и заметки чужих занятий
      if (groupId && enrollment.groupId !== groupId) throw new ForbiddenException("forbidden");
    } else if (user.role === "TEACHER" && groupId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { teacherId: true, groups: { select: { id: true, teacherId: true } } },
      });
      if (!course || !canManageCourseAttendance(user, course, groupId)) {
        throw new NotFoundException("courseNotFound");
      }
    }

    return this.prisma.attendanceSession.findMany({
      where: { courseId, ...(groupId ? { groupId } : {}) },
      include: {
        _count: { select: { records: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        // Группа занятия нужна странице отметки: по ней сужается список учеников
        group: { select: { id: true, name: true } },
        records: {
          where: isStaff ? undefined : { studentId: user.id },
          include: {
            student: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { date: "desc" },
    });
  }

  async createSession(data: CreateSessionDto, actor: SessionUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId },
      select: { id: true, teacherId: true, groups: { select: { id: true, teacherId: true } } },
    });
    if (!course) throw new NotFoundException("courseNotFound");

    // Не только педагог курса: занятие группы вправе завести и её педагог
    if (!canManageCourseAttendance(actor, course, data.groupId ?? null)) {
      throw new NotFoundException("courseNotFound");
    }

    // У курса есть группы — занятие обязательно заводится в одной из них:
    // «ничьё» занятие иначе не попало бы ни в один журнал группы (план
    // «Журнал посещаемости по группам», п.1). У курсов без групп (на проде
    // таких нет) поведение прежнее — группа необязательна.
    if (course.groups.length > 0 && !data.groupId) {
      throw new BadRequestException("groupRequired");
    }
    if (data.groupId && !course.groups.some((group) => group.id === data.groupId)) {
      throw new BadRequestException("groupNotInCourse");
    }

    // Преподаватель подставляется заранее: у группы свой, иначе педагог курса.
    // Администратор при желании поменяет — например, при замене.
    const defaultTeacherId = await this.resolveDefaultTeacherId(data.courseId, data.groupId ?? null);

    // Новое занятие меняет раскладку зарплаты за месяц (этап 3 плана «Уроки
    // и карточка группы») — фиксируем закрытые месяцы ДО создания, иначе
    // ещё не замороженный закрытый месяц задним числом пересчитался бы уже
    // с этим занятием (план, 4.8.1)
    await this.salary.freezeClosedMonths({ groupId: data.groupId ?? null, courseId: data.courseId });

    try {
      const session = await this.prisma.attendanceSession.create({
        data: {
          courseId: data.courseId,
          date: new Date(`${data.date}T00:00:00.000Z`),
          note: data.note,
          groupId: data.groupId ?? null,
          teacherId: defaultTeacherId,
        },
      });

      await this.audit.record({
        userId: actor.id,
        entityType: "AttendanceSession",
        entityId: session.id,
        action: "CREATE",
        metadata: { courseId: data.courseId, date: data.date },
      });
      return session;
    } catch (error) {
      // P2002 — и обычная уникальность (курс, дата, группа), и частичный индекс
      // для занятий без группы. Сверяем код ошибки, а не текст: он не зависит
      // ни от версии Prisma, ни от языка.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("sessionAlreadyExists");
      }
      throw error;
    }
  }

  async updateRecords(sessionId: string, data: UpdateRecordsDto, actor: SessionUser) {
    const session = await this.findManageableSession(sessionId, actor);

    // Смена ведущего или его отметки — вход раскладки по занятиям (план,
    // 4.8.1). Студенческие отметки (data.records) на зарплату не влияют, но
    // замораживаем всегда: teacherData может быть пустым в этом вызове, а
    // проверять заранее — держать два места истины вместо одного
    await this.salary.freezeClosedMonths({ groupId: session.groupId, courseId: session.course.id });

    // Отличаем «не менять» от «очистить»: отсутствие поля оставляет значение,
    // а null его стирает.
    const teacherData: Prisma.AttendanceSessionUpdateInput = {};
    if (data.teacher) {
      if (data.teacher.status !== undefined) teacherData.teacherStatus = data.teacher.status;
      if (data.teacher.note !== undefined) teacherData.teacherNote = data.teacher.note;
      if (data.teacher.startedAt !== undefined) {
        teacherData.startedAt = data.teacher.startedAt ? new Date(data.teacher.startedAt) : null;
      }
      if (data.teacher.endedAt !== undefined) {
        teacherData.endedAt = data.teacher.endedAt ? new Date(data.teacher.endedAt) : null;
      }

      // Ведущего занятия меняет только администратор: иначе преподаватель
      // прямым вызовом перевесил бы свой пропуск на коллегу.
      if (data.teacher.teacherId !== undefined) {
        if (actor.role !== "ADMIN") throw new ForbiddenException("onlyAdminCanChangeTeacher");
        if (data.teacher.teacherId === null) {
          teacherData.teacher = { disconnect: true };
        } else {
          const candidate = await this.prisma.user.findFirst({
            where: { id: data.teacher.teacherId, role: { in: ["TEACHER", "ADMIN"] }, isActive: true },
            select: { id: true },
          });
          if (!candidate) throw new NotFoundException("teacherNotFound");
          teacherData.teacher = { connect: { id: candidate.id } };
        }
      }
    }

    // Кому шлём «не был(а) на занятии» (план, 2.1): только переход В ABSENT.
    // Старые статусы нужны ДО транзакции — после неё в базе уже новые.
    // Дедуп по studentId — последняя запись массива побеждает: на случай
    // дубля в одном payload сравниваем со старым статусом только финальное
    // значение, а не промежуточное (иначе «сняли в рамках того же сохранения»
    // всё равно улетело бы уведомлением).
    const finalStatusByStudent = new Map(data.records.map((record) => [record.studentId, record.status]));
    const previousRecords = await this.prisma.attendanceRecord.findMany({
      where: { sessionId, studentId: { in: [...finalStatusByStudent.keys()] } },
      select: { studentId: true, status: true },
    });
    const previousStatusByStudent = new Map(previousRecords.map((r) => [r.studentId, r.status]));
    const newlyAbsentStudentIds = [...finalStatusByStudent.entries()]
      .filter(([studentId, status]) => status === "ABSENT" && previousStatusByStudent.get(studentId) !== "ABSENT")
      .map(([studentId]) => studentId);

    await this.prisma.$transaction([
      ...(Object.keys(teacherData).length > 0
        ? [this.prisma.attendanceSession.update({ where: { id: sessionId }, data: teacherData })]
        : []),
      ...data.records.map((record) =>
        this.prisma.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
          create: {
            sessionId,
            studentId: record.studentId,
            status: record.status,
            note: record.note,
          },
          update: { status: record.status, note: record.note },
        })
      ),
    ]);

    await this.audit.record({
      userId: actor.id,
      entityType: "AttendanceSession",
      entityId: sessionId,
      action: "UPDATE",
      metadata: {
        courseId: session.course.id,
        teacher: data.teacher ? { teacherId: data.teacher.teacherId, status: data.teacher.status } : undefined,
        records: data.records.map((record) => ({ studentId: record.studentId, status: record.status })),
      },
    });

    // Уведомление — после записи в БД, не в транзакции: ошибка отправки не
    // должна откатывать отметку в журнале. await, а не fire-and-forget — как
    // и остальные вызовы telegram.send() в проекте (enrollment-requests,
    // auth.service): ParentNotifyService сам ловит свои ошибки и не бросает
    // наружу, поэтому await не рискует уронить запрос, зато отправка гарантированно
    // завершается до ответа — важно и тестам (детерминизм), и логике «не
    // послать дважды на один и тот же пропуск» при быстрых повторных сохранениях.
    if (newlyAbsentStudentIds.length > 0) {
      await this.notifyAbsences(newlyAbsentStudentIds, session).catch((error) =>
        this.logger.warn(`Не удалось разослать уведомления о пропуске: ${String(error)}`)
      );
    }
  }

  private async notifyAbsences(
    studentIds: string[],
    session: { date: Date; course: { title: string }; group: { name: string } | null }
  ) {
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const dateDdMm = toDdMm(dateKeyOf(session.date));
    const groupOrCourseName = session.group?.name ?? session.course.title;
    await Promise.all(
      students.map((student) =>
        this.parentNotify.notifyAbsence({
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          groupOrCourseName,
          dateDdMm,
        })
      )
    );
  }

  async deleteSession(sessionId: string, actor: SessionUser) {
    const session = await this.findManageableSession(sessionId, actor);

    // Занятие исчезает из раскладки зарплаты — фиксируем закрытые месяцы до
    // удаления (план, 4.8.1), тот же приём, что при создании занятия
    await this.salary.freezeClosedMonths({ groupId: session.groupId, courseId: session.course.id });

    await this.prisma.attendanceSession.delete({ where: { id: sessionId } });

    await this.audit.record({
      userId: actor.id,
      entityType: "AttendanceSession",
      entityId: sessionId,
      action: "DELETE",
      metadata: { courseId: session.course.id, date: session.date.toISOString() },
    });
  }

  /** Матрица «ученик × занятие» для отчёта по курсу, groupId — по одной группе. */
  async report(courseId: string, user: SessionUser, groupId?: string) {
    if (user.role === "TEACHER" && groupId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { teacherId: true, groups: { select: { id: true, teacherId: true } } },
      });
      if (!course || !canManageCourseAttendance(user, course, groupId)) {
        throw new NotFoundException("courseNotFound");
      }
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { courseId, ...(groupId ? { groupId } : {}) },
      include: {
        records: {
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { date: "asc" },
    });

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, ...(groupId ? { groupId } : {}) },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { student: { firstName: "asc" } },
    });

    const students = enrollments.map((enrollment) => enrollment.student);
    const matrix = students.map((student) => {
      const attendance: Record<string, { status: AttendanceStatus; note?: string | null }> = {};
      for (const session of sessions) {
        const record = session.records.find((item) => item.studentId === student.id);
        if (record) attendance[session.id] = { status: record.status, note: record.note };
      }
      return { student, attendance };
    });

    return {
      sessions: sessions.map((session) => ({ id: session.id, date: session.date, note: session.note })),
      students: matrix,
    };
  }

  /**
   * Посещаемость одного ученика. Ученик читает только себя, родитель — только
   * своих детей: раньше для любой роли, кроме STUDENT, id брался из аргумента
   * без проверки родства (аудит 2.4).
   */
  async studentAttendance(requestedStudentId: string | undefined, user: SessionUser) {
    let studentId: string;

    if (user.role === "STUDENT") {
      studentId = user.id;
    } else if (!requestedStudentId) {
      throw new BadRequestException("studentRequired");
    } else if (user.role === "PARENT") {
      const link = await this.prisma.parentStudent.findUnique({
        where: { parentId_studentId: { parentId: user.id, studentId: requestedStudentId } },
        select: { id: true },
      });
      if (!link) throw new NotFoundException("studentNotFound");
      studentId = requestedStudentId;
    } else {
      studentId = requestedStudentId;
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId },
      include: { session: { include: { course: { select: { id: true, title: true } } } } },
      orderBy: { session: { date: "desc" } },
    });

    const courseMap = new Map<
      string,
      {
        course: { id: string; title: string };
        records: { sessionId: string; date: Date; status: AttendanceStatus; note: string | null }[];
      }
    >();

    for (const record of records) {
      const courseId = record.session.course.id;
      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, { course: record.session.course, records: [] });
      }
      courseMap.get(courseId)!.records.push({
        sessionId: record.sessionId,
        date: record.session.date,
        status: record.status,
        note: record.note,
      });
    }

    return [...courseMap.values()];
  }

  /**
   * Группы для раздела «Посещаемость» (план «Журнал посещаемости по
   * группам», п.1): группа, курс, филиал, преподаватель, занятий по
   * расписанию за месяц и сколько из них отмечено — тот же расчёт, что и
   * «неполный журнал» на главной администратора
   * (admin-dashboard.service.ts → countGroupsWithIncompleteJournal), только
   * с самими числами, а не только фактом неполноты. query.groupId сужает
   * список до одной группы — им пользуется шапка её журнала (раздел 2 плана),
   * чтобы не держать этот расчёт в двух местах.
   */
  async groupsOverview(query: AttendanceGroupsQueryDto, user: SessionUser) {
    if (user.role !== "ADMIN" && user.role !== "TEACHER") throw new ForbiddenException("forbidden");

    const month = query.month ?? currentMonthKey();
    const monthFrom = monthStart(month);
    const isCurrentMonth = month === currentMonthKey();
    // За прошлый месяц журнал уже закрыт целиком — план считаем по конец
    // месяца; за текущий — по сегодня, иначе план обгонит ещё не наступившие дни
    const periodTo = isCurrentMonth ? toNoonUtc(currentDateKey()) : monthEnd(month);

    const responsibleTeacherFilter = (teacherId: string) => ({
      OR: [{ teacherId }, { AND: [{ teacherId: null }, { course: { teacherId } }] }],
    });

    const groups = await this.prisma.group.findMany({
      where: {
        AND: [
          { isActive: true, course: { deletedAt: null } },
          query.groupId ? { id: query.groupId } : {},
          query.branchId ? { branchId: query.branchId } : {},
          query.teacherId ? responsibleTeacherFilter(query.teacherId) : {},
          // Та же лестница «педагог группы → педагог курса», что и на
          // управление занятиями (canManageCourseAttendance): курс целиком
          // виден своему педагогу, чужой курс — только по своей группе в нём
          user.role === "TEACHER" ? { OR: [{ teacherId: user.id }, { course: { teacherId: user.id } }] } : {},
        ],
      },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        branch: { select: { id: true, name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ branch: { name: "asc" } }, { course: { title: "asc" } }, { name: "asc" }],
    });

    const groupIds = groups.map((group) => group.id);
    // Все занятия групп, не только за выбранный месяц: последняя дата занятия
    // нужна не только за него — это просто «когда журнал трогали в последний раз»
    const sessions =
      groupIds.length > 0
        ? await this.prisma.attendanceSession.findMany({
            where: { groupId: { in: groupIds } },
            select: { groupId: true, date: true },
          })
        : [];
    const datesByGroup = new Map<string, Date[]>();
    for (const session of sessions) {
      if (!session.groupId) continue;
      const list = datesByGroup.get(session.groupId) ?? [];
      list.push(session.date);
      datesByGroup.set(session.groupId, list);
    }

    return groups.map((group) => {
      const teacher = group.teacher ?? group.course.teacher;
      const dates = datesByGroup.get(group.id) ?? [];
      const from =
        group.startDate && group.startDate.getTime() > monthFrom.getTime() ? group.startDate : monthFrom;
      // Группа ещё не начала заниматься в выбранном месяце — план нулевой,
      // а не отрицательный интервал
      const planned =
        group.scheduleDays.length === 0 || from.getTime() > periodTo.getTime()
          ? 0
          : countLessons(group.scheduleDays, from, periodTo);
      const marked = dates.filter((date) => date.getTime() >= from.getTime() && date.getTime() <= periodTo.getTime())
        .length;
      const lastSessionDate =
        dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;

      return {
        groupId: group.id,
        groupName: group.name,
        courseId: group.course.id,
        courseSlug: group.course.slug,
        courseTitle: group.course.title,
        branchId: group.branch.id,
        branchName: group.branch.name,
        teacherId: teacher?.id ?? null,
        teacherName: teacher ? `${teacher.lastName} ${teacher.firstName}` : null,
        plannedLessons: planned,
        markedLessons: marked,
        lastSessionDate,
      };
    });
  }

  private async resolveDefaultTeacherId(courseId: string, groupId: string | null) {
    if (groupId) {
      const group = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { teacherId: true },
      });
      if (group?.teacherId) return group.teacherId;
    }
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { teacherId: true },
    });
    return course?.teacherId ?? null;
  }

  /** Занятие, которое вызывающий вправе вести. Чужое — 404. */
  private async findManageableSession(sessionId: string, actor: SessionUser) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        // title/name нужны только уведомлению о пропуске (updateRecords), но
        // это одна общая функция для всех операций над занятием — лишние
        // строки в select дешевле второго похожего запроса
        course: { select: { id: true, title: true, teacherId: true } },
        group: { select: { name: true, teacherId: true } },
      },
    });
    if (!session) throw new NotFoundException("sessionNotFound");
    if (!canManageSession(actor, session)) throw new NotFoundException("sessionNotFound");
    return session;
  }

  /** Для отчётов по преподавателям: кто числится за занятием. */
  responsibleFor = responsibleTeacherId;
}

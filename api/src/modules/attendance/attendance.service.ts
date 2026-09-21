import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { activeEnrollmentFilter } from "../billing/billing-ledger.service";
import { SalaryService } from "../salary/salary.service";
import { canManageCourseAttendance, canManageSession, responsibleTeacherId } from "./domain/attendance-access";
import type { CreateSessionDto, UpdateRecordsDto } from "./dto/attendance.dto";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** Перенесено из src/actions/attendance-actions.ts в web. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly salary: SalaryService
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
   */
  async sessions(courseId: string, user: SessionUser) {
    const isStaff = user.role === "ADMIN" || user.role === "TEACHER";

    if (!isStaff) {
      if (user.role !== "STUDENT") throw new ForbiddenException("forbidden");
      // Отчисленный (billingEndsAt без группы) посещаемость курса не видит —
      // запись жива только ради истории начислений
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { studentId: user.id, courseId, ...activeEnrollmentFilter() },
        select: { id: true },
      });
      if (!enrollment) throw new ForbiddenException("forbidden");
    }

    return this.prisma.attendanceSession.findMany({
      where: { courseId },
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

  /** Матрица «ученик × занятие» для отчёта по курсу. */
  async report(courseId: string) {
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { courseId },
      include: {
        records: {
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { date: "asc" },
    });

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
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
        course: { select: { id: true, teacherId: true } },
        group: { select: { teacherId: true } },
      },
    });
    if (!session) throw new NotFoundException("sessionNotFound");
    if (!canManageSession(actor, session)) throw new NotFoundException("sessionNotFound");
    return session;
  }

  /** Для отчётов по преподавателям: кто числится за занятием. */
  responsibleFor = responsibleTeacherId;
}

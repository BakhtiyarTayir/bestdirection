"use server";

import { prisma, prismaUnscoped } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog } from "@/lib/audit";
import { nameCollator } from "@/lib/collator";
import { Prisma } from "@/generated/prisma";
import { canManageCourseAttendance, canManageSession } from "@/lib/attendance-access";
import type { AttendanceStatus } from "@/validators/attendance";

async function revalidateCourseAttendance(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { slug: true },
  });
  if (course) {
    revalidateLocalized(`/courses/${course.slug}/attendance`);
  }
}

/**
 * Кто по умолчанию ведёт занятие: преподаватель группы, а если у неё не
 * задан — преподаватель курса. Group.teacherId появился позже Course.teacherId,
 * поэтому у части групп он пустой.
 */
async function resolveDefaultTeacherId(
  courseId: string,
  groupId: string | null
): Promise<string | null> {
  if (groupId) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { teacherId: true },
    });
    if (group?.teacherId) return group.teacherId;
  }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true },
  });
  return course?.teacherId ?? null;
}

// ---------- getAttendanceSessions ----------
export async function getAttendanceSessions(courseId: string) {
  return withAuth(async () => {
    const sessions = await prisma.attendanceSession.findMany({
      where: { courseId },
      include: {
        _count: { select: { records: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        // Группа занятия нужна странице отметки: по ней сужается список учеников
        group: { select: { id: true, name: true } },
        records: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { date: "desc" },
    });

    return { success: true, data: sessions };
  });
}

// ---------- createAttendanceSession ----------
export async function createAttendanceSession(data: {
  courseId: string;
  date: Date | string;
  note?: string;
  groupId?: string;
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const course = await prisma.course.findUnique({
        where: { id: data.courseId },
        select: { id: true, teacherId: true, groups: { select: { id: true, teacherId: true } } },
      });
      if (!course) return { success: false, error: "Course not found" };

      // Не только педагог курса: занятие группы вправе завести и её педагог
      if (!canManageCourseAttendance({ id: session.user.id, role }, course, data.groupId || null)) {
        return { success: false, error: "You can only create sessions for your own courses" };
      }

      const dateValue = new Date(data.date);

      // Преподаватель подставляется заранее: у группы свой, иначе педагог
      // курса. Администратор при желании поменяет — например, при замене.
      const defaultTeacherId = await resolveDefaultTeacherId(
        data.courseId,
        data.groupId || null
      );

      try {
        const attendanceSession = await prisma.attendanceSession.create({
          data: {
            courseId: data.courseId,
            date: dateValue,
            note: data.note,
            groupId: data.groupId || null,
            teacherId: defaultTeacherId,
          },
        });

        await createAuditLog({
          userId: session.user.id,
          entityType: "AttendanceSession",
          entityId: attendanceSession.id,
          action: "CREATE",
          metadata: { courseId: data.courseId, date: String(data.date) },
        });

        await revalidateCourseAttendance(data.courseId);
        return { success: true, data: attendanceSession };
      } catch (error) {
        // P2002 — и обычная уникальность (курс, дата, группа), и частичный
        // индекс для занятий без группы (миграция
        // 20260916090000_attendance_no_group_unique). Сверяем код ошибки, а не
        // текст: он не зависит ни от версии Prisma, ни от языка.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return { success: false, error: "An attendance session already exists for this date" };
        }
        throw error;
      }
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateAttendanceRecords ----------
export async function updateAttendanceRecords(data: {
  sessionId: string;
  records: { studentId: string; status: AttendanceStatus; note?: string }[];
  // Отметка преподавателя приходит тем же запросом, что и ученики: это одна
  // операция для пользователя, и разделять её на два действия значило бы
  // допустить состояние «учеников отметили, педагога нет».
  teacher?: {
    teacherId?: string | null;
    status?: AttendanceStatus | null;
    note?: string | null;
    startedAt?: Date | string | null;
    endedAt?: Date | string | null;
  };
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const attendanceSession = await prisma.attendanceSession.findUnique({
        where: { id: data.sessionId },
        include: {
          course: { select: { id: true, teacherId: true } },
          group: { select: { teacherId: true } },
        },
      });

      if (!attendanceSession) {
        return { success: false, error: "Attendance session not found" };
      }

      if (!canManageSession({ id: session.user.id, role }, attendanceSession)) {
        return { success: false, error: "You can only update attendance for your own courses" };
      }

      // Отличаем «не менять» от «очистить»: отсутствие поля оставляет значение,
      // а null его стирает. Раньше всё шло через `?? undefined`, и стереть
      // заметку было невозможно — она молча возвращалась после обновления.
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
          if (role !== "ADMIN") {
            return { success: false, error: "onlyAdminCanChangeTeacher" };
          }
          if (data.teacher.teacherId === null) {
            teacherData.teacher = { disconnect: true };
          } else {
            const candidate = await prisma.user.findFirst({
              where: {
                id: data.teacher.teacherId,
                role: { in: ["TEACHER", "ADMIN"] },
                isActive: true,
              },
              select: { id: true },
            });
            if (!candidate) {
              return { success: false, error: "teacherNotFound" };
            }
            teacherData.teacher = { connect: { id: candidate.id } };
          }
        }
      }

      await prisma.$transaction([
        ...(Object.keys(teacherData).length > 0
          ? [
              prisma.attendanceSession.update({
                where: { id: data.sessionId },
                data: teacherData,
              }),
            ]
          : []),
        ...data.records.map((record) =>
          prisma.attendanceRecord.upsert({
            where: {
              sessionId_studentId: {
                sessionId: data.sessionId,
                studentId: record.studentId,
              },
            },
            create: {
              sessionId: data.sessionId,
              studentId: record.studentId,
              status: record.status,
              note: record.note,
            },
            update: {
              status: record.status,
              note: record.note,
            },
          })
        ),
      ]);

      await createAuditLog({
        userId: session.user.id,
        entityType: "AttendanceSession",
        entityId: data.sessionId,
        action: "UPDATE",
        metadata: {
          courseId: attendanceSession.course.id,
          teacher: data.teacher
            ? { teacherId: data.teacher.teacherId, status: data.teacher.status }
            : undefined,
          records: data.records.map((r) => ({
            studentId: r.studentId,
            status: r.status,
          })),
        },
      });

      await revalidateCourseAttendance(attendanceSession.course.id);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getAttendanceReport ----------
export async function getAttendanceReport(courseId: string) {
  return withAuth(async () => {
    const sessions = await prisma.attendanceSession.findMany({
      where: { courseId },
      include: {
        records: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { student: { firstName: "asc" } },
    });

    const students = enrollments.map((e) => e.student);

    const matrix = students.map((student) => {
      const attendance: Record<
        string,
        { status: AttendanceStatus; note?: string | null }
      > = {};

      for (const sess of sessions) {
        const record = sess.records.find((r) => r.studentId === student.id);
        if (record) {
          attendance[sess.id] = {
            status: record.status,
            note: record.note,
          };
        }
      }

      return { student, attendance };
    });

    const sessionsSummary = sessions.map((s) => ({
      id: s.id,
      date: s.date,
      note: s.note,
    }));

    return {
      success: true,
      data: { sessions: sessionsSummary, students: matrix },
    };
  });
}

// ---------- getStudentAttendance ----------
export async function getStudentAttendance(studentId?: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    let targetStudentId: string;

    if (role === "STUDENT") {
      targetStudentId = session.user.id;
    } else if (studentId) {
      targetStudentId = studentId;
    } else {
      return { success: false, error: "Student ID is required" };
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: targetStudentId },
      include: {
        session: {
          include: {
            course: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { session: { date: "desc" } },
    });

    const courseMap = new Map<
      string,
      {
        course: { id: string; title: string };
        records: {
          sessionId: string;
          date: Date;
          status: AttendanceStatus;
          note: string | null;
        }[];
      }
    >();

    for (const record of records) {
      const courseId = record.session.course.id;
      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          course: record.session.course,
          records: [],
        });
      }
      courseMap.get(courseId)!.records.push({
        sessionId: record.sessionId,
        date: record.session.date,
        status: record.status,
        note: record.note,
      });
    }

    const data = Array.from(courseMap.values());

    return { success: true, data };
  });
}

// ---------- deleteAttendanceSession ----------
export async function deleteAttendanceSession(id: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.attendanceSession.findUnique({
        where: { id },
        include: {
          course: { select: { id: true, teacherId: true } },
          group: { select: { teacherId: true } },
        },
      });

      if (!existing) return { success: false, error: "Attendance session not found" };

      if (!canManageSession({ id: session.user.id, role }, existing)) {
        return { success: false, error: "You can only delete sessions for your own courses" };
      }

      await prisma.attendanceSession.delete({ where: { id } });

      await createAuditLog({
        userId: session.user.id,
        entityType: "AttendanceSession",
        entityId: id,
        action: "DELETE",
        metadata: {
          courseId: existing.course.id,
          date: existing.date.toISOString(),
        },
      });

      await revalidateCourseAttendance(existing.course.id);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getTeacherAttendanceReport ----------
/**
 * Сводка по преподавателям за период: сколько занятий числится, сколько
 * проведено, пропущено и не отмечено.
 *
 * Занятия без teacherId (все, что были до появления отметки) считаются по
 * преподавателю группы, а при его отсутствии — по преподавателю курса.
 * Иначе вся история выпала бы из отчёта.
 */
export async function getTeacherAttendanceReport(params?: {
  from?: Date | string;
  to?: Date | string;
  teacherId?: string;
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;
      // Преподаватель видит только свою статистику, администратор — всю
      const teacherFilter =
        role === "TEACHER" ? session.user.id : params?.teacherId;

      // Границы периода приходят из строки запроса, поэтому мусор отсекаем:
      // new Date("чушь") дал бы Invalid Date и запрос упал бы целиком
      const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
      const parseBound = (value?: Date | string) => {
        if (!value) return undefined;
        if (value instanceof Date) return value;
        return DATE_ONLY.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;
      };
      const from = parseBound(params?.from);
      const to = parseBound(params?.to);

      const dateWhere =
        from || to
          ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {};

      const sessions = await prisma.attendanceSession.findMany({
        // Курсы из Корзины не считаются: их занятия больше не ведутся, а
        // статистика преподавателя продолжала бы их учитывать
        where: { ...dateWhere, course: { deletedAt: null } },
        select: {
          id: true,
          date: true,
          teacherId: true,
          teacherStatus: true,
          startedAt: true,
          endedAt: true,
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

      for (const s of sessions) {
        const responsibleId =
          s.teacherId ?? s.group?.teacherId ?? s.course.teacherId ?? null;
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
        switch (s.teacherStatus) {
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

      if (rows.size === 0) return { success: true as const, data: [] };

      // prismaUnscoped намеренно: обычный клиент прячет удалённых пользователей
      // (см. src/lib/prisma.ts), и строка удалённого преподавателя осталась бы
      // в отчёте с цифрами, но без имени
      const teachers = await prismaUnscoped.user.findMany({
        where: { id: { in: [...rows.keys()] } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const t of teachers) {
        const row = rows.get(t.id);
        if (row) {
          row.firstName = t.firstName;
          row.lastName = t.lastName;
        }
      }

      const collator = await nameCollator();
      return {
        success: true as const,
        data: [...rows.values()].sort((a, b) =>
          collator.compare(`${a.lastName}${a.firstName}`, `${b.lastName}${b.firstName}`)
        ),
      };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

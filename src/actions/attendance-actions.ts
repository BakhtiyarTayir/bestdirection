"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog } from "@/lib/audit";
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

      if (role === "TEACHER") {
        const course = await prisma.course.findUnique({
          where: { id: data.courseId },
        });
        if (!course) return { success: false, error: "Course not found" };
        if (course.teacherId !== session.user.id) {
          return { success: false, error: "You can only create sessions for your own courses" };
        }
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
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
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
        },
      });

      if (!attendanceSession) {
        return { success: false, error: "Attendance session not found" };
      }

      if (role === "TEACHER" && attendanceSession.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only update attendance for your own courses" };
      }

      await prisma.$transaction([
        ...(data.teacher
          ? [
              prisma.attendanceSession.update({
                where: { id: data.sessionId },
                data: {
                  teacherId: data.teacher.teacherId ?? undefined,
                  teacherStatus: data.teacher.status ?? undefined,
                  teacherNote: data.teacher.note ?? undefined,
                  startedAt: data.teacher.startedAt ? new Date(data.teacher.startedAt) : undefined,
                  endedAt: data.teacher.endedAt ? new Date(data.teacher.endedAt) : undefined,
                },
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
        },
      });

      if (!existing) return { success: false, error: "Attendance session not found" };

      if (role === "TEACHER" && existing.course.teacherId !== session.user.id) {
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

      const dateWhere =
        params?.from || params?.to
          ? {
              date: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(params.to) } : {}),
              },
            }
          : {};

      const sessions = await prisma.attendanceSession.findMany({
        where: dateWhere,
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

      const teachers = await prisma.user.findMany({
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

      return {
        success: true as const,
        data: [...rows.values()].sort((a, b) =>
          `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, "ru")
        ),
      };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

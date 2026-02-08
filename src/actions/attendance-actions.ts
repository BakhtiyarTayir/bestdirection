"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import type { AttendanceStatus } from "@/validators/attendance";

// ---------- getAttendanceSessions ----------
export async function getAttendanceSessions(courseId: string) {
  return withAuth(async () => {
    const sessions = await prisma.attendanceSession.findMany({
      where: { courseId },
      include: {
        _count: { select: { records: true } },
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

      try {
        const attendanceSession = await prisma.attendanceSession.create({
          data: {
            courseId: data.courseId,
            date: dateValue,
            note: data.note,
          },
        });

        revalidatePath(`/dashboard/courses/${data.courseId}/attendance`);
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

      await prisma.$transaction(
        data.records.map((record) =>
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
        )
      );

      revalidatePath(`/dashboard/courses/${attendanceSession.course.id}/attendance`);
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

      revalidatePath(`/dashboard/courses/${existing.course.id}/attendance`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

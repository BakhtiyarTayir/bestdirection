"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { AttendanceStatus } from "@/generated/prisma";

// ---------- getAttendanceSessions ----------
export async function getAttendanceSessions(courseId: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const sessions = await prisma.attendanceSession.findMany({
      where: { courseId },
      include: {
        _count: {
          select: { records: true },
        },
      },
      orderBy: { date: "desc" },
    });

    return { success: true, data: sessions };
  } catch (error) {
    console.error("getAttendanceSessions error:", error);
    return { success: false, error: "Failed to fetch attendance sessions" };
  }
}

// ---------- createAttendanceSession ----------
export async function createAttendanceSession(data: {
  courseId: string;
  date: Date | string;
  note?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Teachers can only create sessions for their own courses
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
    console.error("createAttendanceSession error:", error);
    // Check for unique constraint violation (same course + date)
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return { success: false, error: "An attendance session already exists for this date" };
    }
    return { success: false, error: "Failed to create attendance session" };
  }
}

// ---------- updateAttendanceRecords ----------
export async function updateAttendanceRecords(data: {
  sessionId: string;
  records: { studentId: string; status: AttendanceStatus; note?: string }[];
}) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Verify session exists and check ownership
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

    // Upsert each record in a transaction
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
  } catch (error) {
    console.error("updateAttendanceRecords error:", error);
    return { success: false, error: "Failed to update attendance records" };
  }
}

// ---------- getAttendanceReport ----------
export async function getAttendanceReport(courseId: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    // Get all sessions for the course
    const sessions = await prisma.attendanceSession.findMany({
      where: { courseId },
      include: {
        records: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    });

    // Get all enrolled students
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { student: { firstName: "asc" } },
    });

    const students = enrollments.map((e) => e.student);

    // Build the attendance matrix: for each student, map sessionId -> status
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

      return {
        student,
        attendance,
      };
    });

    const sessionsSummary = sessions.map((s) => ({
      id: s.id,
      date: s.date,
      note: s.note,
    }));

    return {
      success: true,
      data: {
        sessions: sessionsSummary,
        students: matrix,
      },
    };
  } catch (error) {
    console.error("getAttendanceReport error:", error);
    return { success: false, error: "Failed to fetch attendance report" };
  }
}

// ---------- getStudentAttendance ----------
export async function getStudentAttendance(studentId?: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;

    // Determine which student's attendance to fetch
    let targetStudentId: string;

    if (role === "STUDENT") {
      // Students can only see their own attendance
      targetStudentId = session.user.id;
    } else if (studentId) {
      targetStudentId = studentId;
    } else {
      return { success: false, error: "Student ID is required" };
    }

    // Get all attendance records for the student, grouped by course
    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: targetStudentId },
      include: {
        session: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: { session: { date: "desc" } },
    });

    // Group by course
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
  } catch (error) {
    console.error("getStudentAttendance error:", error);
    return { success: false, error: "Failed to fetch student attendance" };
  }
}

// ---------- deleteAttendanceSession ----------
export async function deleteAttendanceSession(id: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

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

    // Cascade delete will remove associated records
    await prisma.attendanceSession.delete({ where: { id } });

    revalidatePath(`/dashboard/courses/${existing.course.id}/attendance`);
    return { success: true };
  } catch (error) {
    console.error("deleteAttendanceSession error:", error);
    return { success: false, error: "Failed to delete attendance session" };
  }
}

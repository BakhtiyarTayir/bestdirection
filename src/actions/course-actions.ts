"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { createAuditLog, computeChanges } from "@/lib/audit";

// ---------- getCourses ----------
export async function getCourses() {
  return withAuth(async (session) => {
    const role = session.user.role;
    const userId = session.user.id;

    let courses;

    if (role === "ADMIN") {
      courses = await prisma.course.findMany({
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { enrollments: true, lessons: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    } else if (role === "TEACHER") {
      courses = await prisma.course.findMany({
        where: { teacherId: userId },
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { enrollments: true, lessons: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    } else {
      courses = await prisma.course.findMany({
        where: {
          isPublished: true,
          enrollments: { some: { studentId: userId } },
        },
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { enrollments: true, lessons: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    }

    return { success: true, data: courses };
  });
}

// ---------- getCourseById ----------
export async function getCourseById(id: string) {
  return withAuth(async () => {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { enrollments: true, lessons: true } },
      },
    });

    if (!course) return { success: false, error: "Course not found" };

    return { success: true, data: course };
  });
}

// ---------- createCourse ----------
export async function createCourse(data: {
  title: string;
  description?: string;
  teacherId: string;
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      if (role === "TEACHER" && data.teacherId !== session.user.id) {
        return { success: false, error: "Teachers can only create courses for themselves" };
      }

      const course = await prisma.course.create({
        data: {
          title: data.title,
          description: data.description,
          teacherId: data.teacherId,
        },
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Course",
        entityId: course.id,
        action: "CREATE",
        metadata: { title: course.title },
      });

      revalidatePath("/dashboard/courses");
      return { success: true, data: course };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateCourse ----------
export async function updateCourse(
  id: string,
  data: {
    title?: string;
    description?: string;
    isPublished?: boolean;
    sortOrder?: number;
  }
) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.course.findUnique({ where: { id } });
      if (!existing) return { success: false, error: "Course not found" };

      if (role === "TEACHER" && existing.teacherId !== session.user.id) {
        return { success: false, error: "You can only update your own courses" };
      }

      const course = await prisma.course.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        },
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      const changes = computeChanges(
        { title: existing.title, description: existing.description, isPublished: existing.isPublished, sortOrder: existing.sortOrder },
        data
      );
      if (changes) {
        await createAuditLog({
          userId: session.user.id,
          entityType: "Course",
          entityId: id,
          action: "UPDATE",
          changes,
        });
      }

      revalidatePath("/dashboard/courses");
      revalidatePath(`/dashboard/courses/${id}`);
      return { success: true, data: course };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteCourse ----------
export async function deleteCourse(id: string) {
  return withAuth(
    async (session) => {
      const existing = await prisma.course.findUnique({ where: { id }, select: { title: true } });
      await prisma.course.delete({ where: { id } });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Course",
        entityId: id,
        action: "DELETE",
        metadata: { title: existing?.title },
      });

      revalidatePath("/dashboard/courses");
      return { success: true };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- enrollStudent ----------
export async function enrollStudent(courseId: string, studentId: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const student = await prisma.user.findUnique({ where: { id: studentId } });
      if (!student || student.role !== "STUDENT") {
        return { success: false, error: "Student not found" };
      }

      if (role === "TEACHER") {
        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return { success: false, error: "Course not found" };
        if (course.teacherId !== session.user.id) {
          return { success: false, error: "You can only enroll students in your own courses" };
        }
      }

      const existing = await prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId } },
      });

      if (existing) {
        return { success: false, error: "Student is already enrolled in this course" };
      }

      const enrollment = await prisma.enrollment.create({
        data: { studentId, courseId },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      revalidatePath(`/dashboard/courses/${courseId}`);
      return { success: true, data: enrollment };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- unenrollStudent ----------
export async function unenrollStudent(courseId: string, studentId: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      if (role === "TEACHER") {
        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return { success: false, error: "Course not found" };
        if (course.teacherId !== session.user.id) {
          return { success: false, error: "You can only unenroll students from your own courses" };
        }
      }

      await prisma.enrollment.delete({
        where: { studentId_courseId: { studentId, courseId } },
      });

      revalidatePath(`/dashboard/courses/${courseId}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getEnrolledStudents ----------
export async function getEnrolledStudents(courseId: string) {
  return withAuth(async () => {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const students = enrollments.map((e) => ({
      ...e.student,
      enrolledAt: e.createdAt,
    }));

    return { success: true, data: students };
  });
}

// ---------- getAvailableStudents ----------
export async function getAvailableStudents(courseId: string) {
  return withAuth(
    async () => {
      const students = await prisma.user.findMany({
        where: {
          role: "STUDENT",
          isActive: true,
          enrollments: { none: { courseId } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
        orderBy: { firstName: "asc" },
      });

      return { success: true, data: students };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

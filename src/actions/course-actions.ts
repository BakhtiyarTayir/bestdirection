"use server";

import { freezeClosedMonths } from "@/lib/billing-ledger";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { slugify, generateUniqueSlug } from "@/lib/slugify";

// ---------- getCourses ----------
export async function getCourses() {
  return withAuth(async (session) => {
    const role = session.user.role;
    const userId = session.user.id;

    let courses;

    if (role === "ADMIN") {
      courses = await prisma.course.findMany({
        where: { deletedAt: null },
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
        where: { teacherId: userId, deletedAt: null },
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
          deletedAt: null,
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
      where: { id, deletedAt: null },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        copiedFrom: {
          select: {
            id: true,
            slug: true,
            title: true,
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { enrollments: true, lessons: true, copies: true } },
      },
    });

    if (!course) return { success: false, error: "courseNotFound" };

    return { success: true, data: course };
  });
}

// ---------- createCourse ----------
export async function createCourse(data: {
  title: string;
  description?: string;
  coverImage?: string;
  teacherId: string;
  accessType?: "CLOSED" | "FREE" | "PAID";
  isPublicListed?: boolean;
  price?: number;
  publicSummaryRu?: string;
  publicSummaryUz?: string;
  intakeStartDate?: Date;
  intakeSeats?: number;
  intakeNoteRu?: string;
  intakeNoteUz?: string;
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      if (role === "TEACHER" && data.teacherId !== session.user.id) {
        return { success: false, error: "Teachers can only create courses for themselves" };
      }

      // Занятость slug проверяем без soft-delete-фильтра: уникальный индекс в
      // БД про deletedAt не знает, поэтому slug держит и удалённый курс.
      // Обычный prisma.course его не видит — и create падал с P2002.
      const slug = await generateUniqueSlug(
        slugify(data.title),
        async (s) =>
          !!(await prismaUnscoped.course.findUnique({
            where: { slug: s },
            select: { id: true },
          }))
      );

      const course = await prisma.course.create({
        data: {
          title: data.title,
          slug,
          description: data.description,
          coverImage: data.coverImage,
          teacherId: data.teacherId,
          accessType: data.accessType ?? "CLOSED",
          isPublicListed: data.isPublicListed ?? false,
          price: data.price,
          publicSummaryRu: data.publicSummaryRu,
          publicSummaryUz: data.publicSummaryUz,
          intakeStartDate: data.intakeStartDate,
          intakeSeats: data.intakeSeats,
          intakeNoteRu: data.intakeNoteRu,
          intakeNoteUz: data.intakeNoteUz,
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

      revalidateLocalized("/courses");
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
    coverImage?: string | null;
    isPublished?: boolean;
    sortOrder?: number;
    accessType?: "CLOSED" | "FREE" | "PAID";
    isPublicListed?: boolean;
    price?: number;
    publicSummaryRu?: string;
    publicSummaryUz?: string;
    intakeStartDate?: Date;
    intakeSeats?: number;
    intakeNoteRu?: string;
    intakeNoteUz?: string;
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

      let slugUpdate: { slug: string } | Record<string, never> = {};
      if (data.title !== undefined && data.title !== existing.title) {
        // Без soft-delete-фильтра — по той же причине, что и в createCourse.
        const newSlug = await generateUniqueSlug(
          slugify(data.title),
          async (s) => {
            const found = await prismaUnscoped.course.findUnique({
              where: { slug: s },
              select: { id: true },
            });
            return !!found && found.id !== id;
          }
        );
        slugUpdate = { slug: newSlug };
      }

      // Цена курса меняется только вперёд. Заморозка ленивая, поэтому сначала
      // фиксируем закрытые месяцы по старой цене — иначе месяц, который никто
      // ещё не открывал после его конца, заморозился бы уже по новой
      if (data.price !== undefined && data.price !== existing.price) {
        await freezeClosedMonths({ courseId: id });
      }

      const course = await prisma.course.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...slugUpdate,
          ...(data.description !== undefined && { description: data.description }),
          ...(data.coverImage !== undefined && { coverImage: data.coverImage }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          ...(data.accessType !== undefined && { accessType: data.accessType }),
          ...(data.isPublicListed !== undefined && { isPublicListed: data.isPublicListed }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.publicSummaryRu !== undefined && { publicSummaryRu: data.publicSummaryRu }),
          ...(data.publicSummaryUz !== undefined && { publicSummaryUz: data.publicSummaryUz }),
          ...(data.intakeStartDate !== undefined && { intakeStartDate: data.intakeStartDate }),
          ...(data.intakeSeats !== undefined && { intakeSeats: data.intakeSeats }),
          ...(data.intakeNoteRu !== undefined && { intakeNoteRu: data.intakeNoteRu }),
          ...(data.intakeNoteUz !== undefined && { intakeNoteUz: data.intakeNoteUz }),
        },
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      const changes = computeChanges(
        { title: existing.title, description: existing.description, coverImage: existing.coverImage, isPublished: existing.isPublished, sortOrder: existing.sortOrder },
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

      revalidateLocalized("/courses");
      revalidateLocalized(`/courses/${id}`);
      return { success: true, data: course };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteCourse ----------
export async function deleteCourse(id: string) {
  return withAuth(
    async (session) => {
      const existing = await prisma.course.findUnique({
        where: { id, deletedAt: null },
        select: { title: true, teacherId: true },
      });
      if (!existing) return { success: false, error: "Course not found" };

      // Преподаватель может удалять только свои курсы, админ — любые.
      if (
        session.user.role === "TEACHER" &&
        existing.teacherId !== session.user.id
      ) {
        return { success: false, error: "You can only delete your own courses" };
      }

      // Мягкое удаление: курс уходит в Корзину. Уроки, записи студентов и
      // оплаты сохраняются; админ может восстановить курс или удалить его
      // окончательно из Корзины (см. hardDeleteCourse).
      await prisma.course.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Course",
        entityId: id,
        action: "DELETE",
        metadata: { title: existing.title },
      });

      revalidateLocalized("/courses");
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- enrollStudent ----------
export async function enrollStudent(courseId: string, studentId: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const student = await prisma.user.findUnique({ where: { id: studentId } });
      if (!student || student.role !== "STUDENT") {
        return { success: false, error: "studentNotFound" };
      }

      if (role === "TEACHER") {
        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return { success: false, error: "courseNotFound" };
        if (course.teacherId !== session.user.id) {
          return { success: false, error: "onlyOwnCourses" };
        }
      }

      const existing = await prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId } },
      });

      if (existing) {
        return { success: false, error: "alreadyEnrolled" };
      }

      const enrollment = await prisma.enrollment.create({
        data: { studentId, courseId },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Enrollment",
        entityId: enrollment.id,
        action: "CREATE",
        metadata: { courseId, studentId },
      });

      revalidateLocalized(`/courses/${courseId}`);
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
        if (!course) return { success: false, error: "courseNotFound" };
        if (course.teacherId !== session.user.id) {
          return { success: false, error: "onlyOwnCourses" };
        }
      }

      await prisma.enrollment.delete({
        where: { studentId_courseId: { studentId, courseId } },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Enrollment",
        entityId: `${studentId}:${courseId}`,
        action: "DELETE",
        metadata: { courseId, studentId },
      });

      revalidateLocalized(`/courses/${courseId}`);
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

"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import type { VideoSource } from "@/validators/lesson";

// ---------- getLessons ----------
export async function getLessons(courseId: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    const where =
      role === "STUDENT"
        ? { courseId, isPublished: true }
        : { courseId };

    const lessons = await prisma.lesson.findMany({
      where,
      include: {
        assessment: {
          select: { id: true, title: true, isPublished: true },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return { success: true, data: lessons };
  });
}

// ---------- getLessonById ----------
export async function getLessonById(id: string) {
  return withAuth(async (session) => {
    const lesson = await prisma.lesson.findUnique({
      where: { id },
      include: {
        course: {
          select: { id: true, title: true, teacherId: true },
        },
        assessment: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            timeLimitMin: true,
            maxAttempts: true,
            isPublished: true,
          },
        },
        homeworks: {
          where: session.user.role === "STUDENT" ? { isPublished: true } : {},
          select: {
            id: true,
            slug: true,
            title: true,
            language: true,
            isPublished: true,
            passingScore: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!lesson) return { success: false, error: "Lesson not found" };

    if (session.user.role === "STUDENT" && !lesson.isPublished) {
      return { success: false, error: "Lesson not found" };
    }

    return { success: true, data: lesson };
  });
}

// ---------- createLesson ----------
export async function createLesson(data: {
  title: string;
  content: string;
  videoUrl?: string;
  videoSource?: VideoSource;
  sortOrder: number;
  isPublished: boolean;
  courseId: string;
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
          return { success: false, error: "You can only add lessons to your own courses" };
        }
      }

      const slug = await generateUniqueSlug(
        slugify(data.title),
        async (s) => !!(await prisma.lesson.findFirst({ where: { courseId: data.courseId, slug: s }, select: { id: true } }))
      );

      const lesson = await prisma.lesson.create({
        data: {
          title: data.title,
          slug,
          content: data.content,
          videoUrl: data.videoUrl,
          videoSource: data.videoSource,
          sortOrder: data.sortOrder,
          isPublished: data.isPublished,
          courseId: data.courseId,
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Lesson",
        entityId: lesson.id,
        action: "CREATE",
        metadata: { title: lesson.title, courseId: data.courseId },
      });

      revalidatePath(`/dashboard/courses/${data.courseId}`);
      return { success: true, data: lesson };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateLesson ----------
export async function updateLesson(
  id: string,
  data: {
    title?: string;
    content?: string;
    videoUrl?: string;
    videoSource?: VideoSource;
    sortOrder?: number;
    isPublished?: boolean;
  }
) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.lesson.findUnique({
        where: { id },
        include: { course: { select: { teacherId: true } } },
      });

      if (!existing) return { success: false, error: "Lesson not found" };

      if (role === "TEACHER" && existing.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only update lessons in your own courses" };
      }

      let slugUpdate: { slug: string } | Record<string, never> = {};
      if (data.title !== undefined && data.title !== existing.title) {
        const newSlug = await generateUniqueSlug(
          slugify(data.title),
          async (s) => {
            const found = await prisma.lesson.findFirst({ where: { courseId: existing.courseId, slug: s }, select: { id: true } });
            return !!found && found.id !== id;
          }
        );
        slugUpdate = { slug: newSlug };
      }

      const lesson = await prisma.lesson.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...slugUpdate,
          ...(data.content !== undefined && { content: data.content }),
          ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
          ...(data.videoSource !== undefined && { videoSource: data.videoSource }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        },
      });

      const changes = computeChanges(
        { title: existing.title, content: existing.content, isPublished: existing.isPublished, sortOrder: existing.sortOrder },
        data
      );
      if (changes) {
        await createAuditLog({
          userId: session.user.id,
          entityType: "Lesson",
          entityId: id,
          action: "UPDATE",
          changes,
        });
      }

      revalidatePath(`/dashboard/courses/${existing.courseId}`);
      revalidatePath(`/dashboard/courses/${existing.courseId}/lessons/${id}`);
      return { success: true, data: lesson };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteLesson ----------
export async function deleteLesson(id: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.lesson.findUnique({
        where: { id },
        include: { course: { select: { id: true, teacherId: true } } },
      });

      if (!existing) return { success: false, error: "Lesson not found" };

      if (role === "TEACHER" && existing.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only delete lessons in your own courses" };
      }

      await prisma.lesson.delete({ where: { id } });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Lesson",
        entityId: id,
        action: "DELETE",
        metadata: { title: existing.title, courseId: existing.course.id },
      });

      revalidatePath(`/dashboard/courses/${existing.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

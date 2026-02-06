"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { LessonType, VideoSource } from "@/generated/prisma";

// ---------- getLessons ----------
export async function getLessons(courseId: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;

    // Students only see published lessons
    const where =
      role === "STUDENT"
        ? { courseId, isPublished: true }
        : { courseId };

    const lessons = await prisma.lesson.findMany({
      where,
      include: {
        test: {
          select: {
            id: true,
            title: true,
            isPublished: true,
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return { success: true, data: lessons };
  } catch (error) {
    console.error("getLessons error:", error);
    return { success: false, error: "Failed to fetch lessons" };
  }
}

// ---------- getLessonById ----------
export async function getLessonById(id: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const lesson = await prisma.lesson.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            teacherId: true,
          },
        },
        test: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            timeLimitMin: true,
            maxAttempts: true,
            isPublished: true,
          },
        },
      },
    });

    if (!lesson) return { success: false, error: "Lesson not found" };

    // Students can only see published lessons
    if (session.user.role === "STUDENT" && !lesson.isPublished) {
      return { success: false, error: "Lesson not found" };
    }

    return { success: true, data: lesson };
  } catch (error) {
    console.error("getLessonById error:", error);
    return { success: false, error: "Failed to fetch lesson" };
  }
}

// ---------- createLesson ----------
export async function createLesson(data: {
  title: string;
  type: LessonType;
  content?: string;
  videoUrl?: string;
  videoSource?: VideoSource;
  sortOrder: number;
  isPublished: boolean;
  courseId: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Teachers can only add lessons to their own courses
    if (role === "TEACHER") {
      const course = await prisma.course.findUnique({
        where: { id: data.courseId },
      });
      if (!course) return { success: false, error: "Course not found" };
      if (course.teacherId !== session.user.id) {
        return { success: false, error: "You can only add lessons to your own courses" };
      }
    }

    const lesson = await prisma.lesson.create({
      data: {
        title: data.title,
        type: data.type,
        content: data.content,
        videoUrl: data.videoUrl,
        videoSource: data.videoSource,
        sortOrder: data.sortOrder,
        isPublished: data.isPublished,
        courseId: data.courseId,
      },
    });

    revalidatePath(`/dashboard/courses/${data.courseId}`);
    return { success: true, data: lesson };
  } catch (error) {
    console.error("createLesson error:", error);
    return { success: false, error: "Failed to create lesson" };
  }
}

// ---------- updateLesson ----------
export async function updateLesson(
  id: string,
  data: {
    title?: string;
    type?: LessonType;
    content?: string;
    videoUrl?: string;
    videoSource?: VideoSource;
    sortOrder?: number;
    isPublished?: boolean;
  }
) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    const existing = await prisma.lesson.findUnique({
      where: { id },
      include: { course: { select: { teacherId: true } } },
    });

    if (!existing) return { success: false, error: "Lesson not found" };

    // Teachers can only update lessons in their own courses
    if (role === "TEACHER" && existing.course.teacherId !== session.user.id) {
      return { success: false, error: "You can only update lessons in your own courses" };
    }

    const lesson = await prisma.lesson.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
        ...(data.videoSource !== undefined && { videoSource: data.videoSource }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
      },
    });

    revalidatePath(`/dashboard/courses/${existing.courseId}`);
    revalidatePath(`/dashboard/courses/${existing.courseId}/lessons/${id}`);
    return { success: true, data: lesson };
  } catch (error) {
    console.error("updateLesson error:", error);
    return { success: false, error: "Failed to update lesson" };
  }
}

// ---------- deleteLesson ----------
export async function deleteLesson(id: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    const existing = await prisma.lesson.findUnique({
      where: { id },
      include: { course: { select: { id: true, teacherId: true } } },
    });

    if (!existing) return { success: false, error: "Lesson not found" };

    // Teachers can only delete lessons in their own courses
    if (role === "TEACHER" && existing.course.teacherId !== session.user.id) {
      return { success: false, error: "You can only delete lessons in your own courses" };
    }

    await prisma.lesson.delete({ where: { id } });

    revalidatePath(`/dashboard/courses/${existing.course.id}`);
    return { success: true };
  } catch (error) {
    console.error("deleteLesson error:", error);
    return { success: false, error: "Failed to delete lesson" };
  }
}

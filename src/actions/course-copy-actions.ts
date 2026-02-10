"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// ---------- copyCourse ----------

export async function copyCourse(
  sourceCourseId: string,
  options?: { newTitle?: string }
) {
  return withAuth(
    async (session) => {
      const source = await prisma.course.findUnique({
        where: { id: sourceCourseId, deletedAt: null },
        include: {
          lessons: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              assessment: {
                include: {
                  questions: {
                    orderBy: { sortOrder: "asc" },
                    include: {
                      options: { orderBy: { sortOrder: "asc" } },
                    },
                  },
                },
              },
            },
          },
          assessments: {
            where: { lessonId: null },
            orderBy: { sortOrder: "asc" },
            include: {
              questions: {
                orderBy: { sortOrder: "asc" },
                include: {
                  options: { orderBy: { sortOrder: "asc" } },
                },
              },
            },
          },
        },
      });

      if (!source) {
        return { success: false as const, error: "Исходный курс не найден" };
      }

      const canCopy =
        source.isPublished ||
        source.isTemplate ||
        source.teacherId === session.user.id;

      if (!canCopy) {
        return { success: false as const, error: "Нет доступа для копирования этого курса" };
      }

      const newCourse = await prisma.$transaction(async (tx) => {
        const course = await tx.course.create({
          data: {
            title: options?.newTitle ?? `${source.title} (копия)`,
            description: source.description,
            coverImage: source.coverImage,
            isPublished: false,
            isTemplate: false,
            sortOrder: 0,
            teacherId: session.user.id,
            copiedFromId: source.id,
            copiedAt: new Date(),
          },
        });

        for (const lesson of source.lessons) {
          const newLesson = await tx.lesson.create({
            data: {
              title: lesson.title,
              content: lesson.content,
              videoUrl: lesson.videoUrl,
              videoSource: lesson.videoSource,
              sortOrder: lesson.sortOrder,
              isPublished: lesson.isPublished,
              courseId: course.id,
            },
          });

          if (lesson.assessment) {
            const newAssessment = await tx.assessment.create({
              data: {
                type: lesson.assessment.type,
                title: lesson.assessment.title,
                description: lesson.assessment.description,
                passingScore: lesson.assessment.passingScore,
                timeLimitMin: lesson.assessment.timeLimitMin,
                maxAttempts: lesson.assessment.maxAttempts,
                sortOrder: lesson.assessment.sortOrder,
                isPublished: lesson.assessment.isPublished,
                courseId: course.id,
                lessonId: newLesson.id,
              },
            });

            for (const question of lesson.assessment.questions) {
              await tx.assessmentQuestion.create({
                data: {
                  text: question.text,
                  type: question.type,
                  points: question.points,
                  sortOrder: question.sortOrder,
                  assessmentId: newAssessment.id,
                  options: {
                    create: question.options.map((opt) => ({
                      text: opt.text,
                      isCorrect: opt.isCorrect,
                      sortOrder: opt.sortOrder,
                    })),
                  },
                },
              });
            }
          }
        }

        for (const exam of source.assessments) {
          const newExam = await tx.assessment.create({
            data: {
              type: exam.type,
              title: exam.title,
              description: exam.description,
              passingScore: exam.passingScore,
              timeLimitMin: exam.timeLimitMin,
              maxAttempts: exam.maxAttempts,
              sortOrder: exam.sortOrder,
              isPublished: exam.isPublished,
              courseId: course.id,
            },
          });

          for (const question of exam.questions) {
            await tx.assessmentQuestion.create({
              data: {
                text: question.text,
                type: question.type,
                points: question.points,
                sortOrder: question.sortOrder,
                assessmentId: newExam.id,
                options: {
                  create: question.options.map((opt) => ({
                    text: opt.text,
                    isCorrect: opt.isCorrect,
                    sortOrder: opt.sortOrder,
                  })),
                },
              },
            });
          }
        }

        return course;
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Course",
        entityId: newCourse.id,
        action: "CREATE",
        metadata: {
          title: newCourse.title,
          copiedFrom: source.title,
          copiedFromId: source.id,
        },
      });

      revalidatePath("/courses");
      return {
        success: true as const,
        data: { id: newCourse.id, title: newCourse.title },
      };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getCoursesForCopy ----------

export async function getCoursesForCopy() {
  return withAuth(
    async () => {
      const courses = await prisma.course.findMany({
        where: {
          deletedAt: null,
          OR: [{ isTemplate: true }, { isPublished: true }],
        },
        select: {
          id: true,
          title: true,
          description: true,
          coverImage: true,
          isTemplate: true,
          createdAt: true,
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              lessons: true,
              assessments: true,
              copies: true,
            },
          },
        },
        orderBy: [{ isTemplate: "desc" }, { createdAt: "desc" }],
      });

      return { success: true as const, data: courses };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getCourseLineage ----------

export async function getCourseLineage(courseId: string) {
  return withAuth(
    async () => {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          copiedAt: true,
          teacher: {
            select: { firstName: true, lastName: true },
          },
          copiedFrom: {
            select: {
              id: true,
              title: true,
              copiedAt: true,
              teacher: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          copies: {
            select: {
              id: true,
              title: true,
              copiedAt: true,
              teacher: {
                select: { firstName: true, lastName: true },
              },
            },
            orderBy: { copiedAt: "desc" },
          },
        },
      });

      if (!course) {
        return { success: false as const, error: "Курс не найден" };
      }

      return { success: true as const, data: course };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

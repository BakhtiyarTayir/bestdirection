"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { submitSolutionInternal } from "@/lib/homework-submission";
import { CODE_HOMEWORK_ENABLED } from "@/lib/code-runner/config";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import type { ProgrammingLanguage, HomeworkType } from "@/validators/homework";

// ---------- Helper: validate lesson ownership ----------
async function validateLessonOwnership(
  lessonId: string,
  userId: string,
  role: string
) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { course: { select: { id: true, teacherId: true } } },
  });
  if (!lesson) return { success: false as const, error: "lessonNotFound" };
  if (role === "TEACHER" && lesson.course.teacherId !== userId) {
    return { success: false as const, error: "onlyOwnCourses" };
  }
  return { success: true as const, lesson };
}

// ---------- Helper: validate homework ownership ----------
async function validateHomeworkOwnership(
  homeworkId: string,
  userId: string,
  role: string
) {
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: {
      lesson: {
        include: { course: { select: { id: true, teacherId: true } } },
      },
    },
  });
  if (!homework) return { success: false as const, error: "homeworkNotFound" };
  if (role === "TEACHER" && homework.lesson.course.teacherId !== userId) {
    return { success: false as const, error: "onlyOwnCourses" };
  }
  return { success: true as const, homework };
}

// ---------- createHomework ----------
export async function createHomework(
  lessonId: string,
  data: {
    title: string;
    description: string;
    type?: HomeworkType;
    language?: ProgrammingLanguage;
    starterCode?: string;
    solutionCode?: string;
    maxAttempts?: number;
    timeLimitSec?: number;
    passingScore?: number;
    dueDate?: Date | null;
    allowLate?: boolean;
    latePenalty?: number;
    isPublished?: boolean;
    testCases?: {
      input: string;
      expected: string;
      isHidden?: boolean;
      points?: number;
      description?: string;
    }[];
  }
) {
  return withAuth(
    async (session) => {
      const ownership = await validateLessonOwnership(lessonId, session.user.id, session.user.role);
      if (!ownership.success) return { success: false, error: ownership.error };

      const type = data.type ?? "FILE";
      if (type === "CODE" && !CODE_HOMEWORK_ENABLED) {
        return { success: false, error: "codeHomeworkDisabled" };
      }

      const slug = await generateUniqueSlug(
        slugify(data.title),
        async (s) => !!(await prisma.homework.findFirst({ where: { lessonId, slug: s }, select: { id: true } }))
      );

      const isFile = type === "FILE";

      const homework = await prisma.homework.create({
        data: {
          title: data.title,
          slug,
          description: data.description,
          type,
          language: isFile ? null : (data.language ?? null),
          starterCode: isFile ? null : data.starterCode,
          solutionCode: isFile ? null : data.solutionCode,
          maxAttempts: data.maxAttempts ?? 10,
          timeLimitSec: isFile ? 5 : (data.timeLimitSec ?? 5),
          passingScore: data.passingScore ?? 60,
          dueDate: data.dueDate,
          allowLate: data.allowLate ?? true,
          latePenalty: data.latePenalty ?? 20,
          requiresManualReview: isFile ? true : false,
          isPublished: data.isPublished ?? false,
          lessonId,
          ...(!isFile && data.testCases ? {
            testCases: {
              create: data.testCases.map((tc, i) => ({
                input: tc.input,
                expected: tc.expected,
                isHidden: tc.isHidden ?? false,
                points: tc.points ?? 1,
                description: tc.description,
                sortOrder: i,
              })),
            },
          } : {}),
        },
        include: { testCases: true },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Homework",
        entityId: homework.id,
        action: "CREATE",
        metadata: { title: homework.title, lessonId },
      });

      revalidateLocalized(`/courses/${ownership.lesson.course.id}`);
      return { success: true, data: homework };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateHomework ----------
export async function updateHomework(
  homeworkId: string,
  data: {
    title?: string;
    description?: string;
    type?: HomeworkType;
    language?: ProgrammingLanguage;
    starterCode?: string;
    solutionCode?: string;
    maxAttempts?: number;
    timeLimitSec?: number;
    passingScore?: number;
    dueDate?: Date | null;
    allowLate?: boolean;
    latePenalty?: number;
    isPublished?: boolean;
    testCases?: {
      input: string;
      expected: string;
      isHidden?: boolean;
      points?: number;
      description?: string;
    }[];
  }
) {
  return withAuth(
    async (session) => {
      const ownership = await validateHomeworkOwnership(homeworkId, session.user.id, session.user.role);
      if (!ownership.success) return { success: false, error: ownership.error };

      const existing = ownership.homework;

      if (data.type === "CODE" && existing.type !== "CODE" && !CODE_HOMEWORK_ENABLED) {
        return { success: false, error: "codeHomeworkDisabled" };
      }

      let slugUpdate: { slug: string } | Record<string, never> = {};
      if (data.title !== undefined && data.title !== existing.title) {
        const newSlug = await generateUniqueSlug(
          slugify(data.title),
          async (s) => {
            const found = await prisma.homework.findFirst({ where: { lessonId: existing.lessonId, slug: s }, select: { id: true } });
            return !!found && found.id !== homeworkId;
          }
        );
        slugUpdate = { slug: newSlug };
      }

      const isFile = data.type === "FILE";

      const homework = await prisma.$transaction(async (tx) => {
        if (isFile) {
          // Remove test cases when switching to FILE type
          await tx.testCase.deleteMany({ where: { homeworkId } });
        } else if (data.testCases) {
          // If testCases provided, replace them all
          await tx.testCase.deleteMany({ where: { homeworkId } });
          await tx.testCase.createMany({
            data: data.testCases.map((tc, i) => ({
              homeworkId,
              input: tc.input,
              expected: tc.expected,
              isHidden: tc.isHidden ?? false,
              points: tc.points ?? 1,
              description: tc.description,
              sortOrder: i,
            })),
          });
        }

        return tx.homework.update({
          where: { id: homeworkId },
          data: {
            ...(data.title !== undefined && { title: data.title }),
            ...slugUpdate,
            ...(data.description !== undefined && { description: data.description }),
            ...(data.type !== undefined && { type: data.type }),
            ...(isFile ? {
              language: null,
              starterCode: null,
              solutionCode: null,
              requiresManualReview: true,
            } : {
              ...(data.language !== undefined && { language: data.language }),
              ...(data.starterCode !== undefined && { starterCode: data.starterCode }),
              ...(data.solutionCode !== undefined && { solutionCode: data.solutionCode }),
            }),
            ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
            ...(data.timeLimitSec !== undefined && { timeLimitSec: data.timeLimitSec }),
            ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
            ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
            ...(data.allowLate !== undefined && { allowLate: data.allowLate }),
            ...(data.latePenalty !== undefined && { latePenalty: data.latePenalty }),
            ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
          },
          include: { testCases: { orderBy: { sortOrder: "asc" } } },
        });
      });

      const changes = computeChanges(
        { title: existing.title, passingScore: existing.passingScore, isPublished: existing.isPublished },
        data
      );
      if (changes) {
        await createAuditLog({
          userId: session.user.id,
          entityType: "Homework",
          entityId: homeworkId,
          action: "UPDATE",
          changes,
        });
      }

      revalidateLocalized(`/courses/${existing.lesson.course.id}`);
      return { success: true, data: homework };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteHomework ----------
export async function deleteHomework(homeworkId: string) {
  return withAuth(
    async (session) => {
      const ownership = await validateHomeworkOwnership(homeworkId, session.user.id, session.user.role);
      if (!ownership.success) return { success: false, error: ownership.error };

      await prisma.homework.delete({ where: { id: homeworkId } });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Homework",
        entityId: homeworkId,
        action: "DELETE",
        metadata: { title: ownership.homework.title },
      });

      revalidateLocalized(`/courses/${ownership.homework.lesson.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- toggleHomeworkPublished ----------
export async function toggleHomeworkPublished(homeworkId: string) {
  return withAuth(
    async (session) => {
      const ownership = await validateHomeworkOwnership(homeworkId, session.user.id, session.user.role);
      if (!ownership.success) return { success: false, error: ownership.error };

      const homework = await prisma.homework.update({
        where: { id: homeworkId },
        data: { isPublished: !ownership.homework.isPublished },
      });

      revalidateLocalized(`/courses/${ownership.homework.lesson.course.id}`);
      return { success: true, data: homework };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getLessonHomeworks ----------
export async function getLessonHomeworks(lessonId: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    const homeworks = await prisma.homework.findMany({
      where: {
        lessonId,
        ...(role === "STUDENT" ? { isPublished: true } : {}),
      },
      include: {
        _count: { select: { testCases: true, submissions: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return { success: true, data: homeworks };
  });
}

// ---------- getHomeworkForStudent ----------
export async function getHomeworkForStudent(homeworkId: string) {
  return withAuth(async (session) => {
    const homework = await prisma.homework.findUnique({
      where: { id: homeworkId, isPublished: true },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        language: true,
        starterCode: true,
        maxAttempts: true,
        timeLimitSec: true,
        passingScore: true,
        maxScore: true,
        dueDate: true,
        allowLate: true,
        latePenalty: true,
        lessonId: true,
        lesson: {
          select: {
            id: true,
            title: true,
            courseId: true,
            course: { select: { id: true, title: true } },
          },
        },
        testCases: {
          where: { isHidden: false },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            input: true,
            expected: true,
            points: true,
            description: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!homework) return { success: false, error: "homeworkNotFound" };

    const submissions = await prisma.submission.findMany({
      where: { homeworkId, studentId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        testResults: {
          include: {
            testCase: {
              select: { id: true, input: true, expected: true, isHidden: true, description: true },
            },
          },
        },
      },
    });

    return {
      success: true,
      data: {
        homework,
        submissions,
        attemptsUsed: submissions.length,
        attemptsRemaining: homework.maxAttempts - submissions.length,
      },
    };
  });
}

// ---------- getHomeworkForTeacher ----------
export async function getHomeworkForTeacher(homeworkId: string) {
  return withAuth(
    async (session) => {
      const ownership = await validateHomeworkOwnership(homeworkId, session.user.id, session.user.role);
      if (!ownership.success) return { success: false, error: ownership.error };

      const homework = await prisma.homework.findUnique({
        where: { id: homeworkId },
        include: {
          testCases: { orderBy: { sortOrder: "asc" } },
          lesson: {
            select: {
              id: true,
              title: true,
              courseId: true,
              course: { select: { id: true, title: true } },
            },
          },
          _count: { select: { submissions: true } },
        },
      });

      if (!homework) return { success: false, error: "homeworkNotFound" };

      return { success: true, data: homework };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getSubmissions ----------
export async function getSubmissions(homeworkId: string) {
  return withAuth(
    async (session) => {
      const ownership = await validateHomeworkOwnership(homeworkId, session.user.id, session.user.role);
      if (!ownership.success) return { success: false, error: ownership.error };

      const submissions = await prisma.submission.findMany({
        where: { homeworkId },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          testResults: {
            include: {
              testCase: {
                select: { id: true, input: true, expected: true, description: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return { success: true, data: submissions };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- submitSolution (web) ----------
export async function submitSolution(homeworkId: string, code: string) {
  return withAuth(async (session) => {
    if (session.user.role !== "STUDENT") {
      return { success: false, error: "onlyStudentsCanSubmit" };
    }

    const result = await submitSolutionInternal(homeworkId, code, session.user.id);

    if (result.success) {
      revalidateLocalized(`/courses/${result.data.courseId}`);
    }

    return result;
  });
}

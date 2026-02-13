"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { runAllTests } from "@/lib/code-runner/test-runner";
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

      const slug = await generateUniqueSlug(
        slugify(data.title),
        async (s) => !!(await prisma.homework.findFirst({ where: { lessonId, slug: s }, select: { id: true } }))
      );

      const isFile = data.type === "FILE";

      const homework = await prisma.homework.create({
        data: {
          title: data.title,
          slug,
          description: data.description,
          type: data.type ?? "CODE",
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

      revalidatePath(`/courses/${ownership.lesson.course.id}`);
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

      revalidatePath(`/courses/${existing.lesson.course.id}`);
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

      revalidatePath(`/courses/${ownership.homework.lesson.course.id}`);
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

      revalidatePath(`/courses/${ownership.homework.lesson.course.id}`);
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

// ---------- submitSolutionInternal (shared by web + telegram) ----------
export async function submitSolutionInternal(homeworkId: string, code: string, studentId: string) {
  // 1. Get homework with test cases
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: {
      testCases: { orderBy: { sortOrder: "asc" } },
      lesson: { select: { courseId: true } },
    },
  });

  if (!homework) return { success: false as const, error: "homeworkNotFound" };
  if (!homework.isPublished) return { success: false as const, error: "homeworkNotPublished" };
  if (!homework.language) return { success: false as const, error: "languageNotSpecified" };

  // Check enrollment
  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_courseId: { studentId, courseId: homework.lesson.courseId },
    },
  });
  if (!enrollment) return { success: false as const, error: "notEnrolled" };

  // 2. Check attempts limit (inside transaction for race condition protection)
  const isLate = homework.dueDate ? new Date() > homework.dueDate : false;
  if (isLate && !homework.allowLate) {
    return { success: false as const, error: "deadlineExpired" };
  }

  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      const attemptsCount = await tx.submission.count({
        where: { homeworkId, studentId },
      });

      if (attemptsCount >= homework.maxAttempts) {
        throw new Error("MAX_ATTEMPTS_REACHED");
      }

      return tx.submission.create({
        data: {
          code,
          status: "RUNNING",
          studentId,
          homeworkId,
          attemptNumber: attemptsCount + 1,
          isLate,
          penalty: isLate ? homework.latePenalty : 0,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MAX_ATTEMPTS_REACHED") {
      return { success: false as const, error: "maxAttemptsReached" };
    }
    throw error;
  }

  // 3. Run tests
  const testResults = await runAllTests(
    homework.language,
    code,
    homework.testCases.map((tc) => ({
      id: tc.id,
      input: tc.input,
      expected: tc.expected,
      points: tc.points,
    })),
    homework.timeLimitSec * 1000
  );

  // 4. Calculate score
  const totalPoints = testResults.reduce((sum, r) => sum + r.points, 0);
  const earnedPoints = testResults
    .filter((r) => r.passed)
    .reduce((sum, r) => sum + r.points, 0);
  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const hasError = testResults.some((r) => r.error !== null);
  const allPassed = testResults.every((r) => r.passed);

  let status: "PASSED" | "PARTIAL" | "FAILED" | "ERROR";
  if (hasError && earnedPoints === 0) {
    status = "ERROR";
  } else if (allPassed) {
    status = "PASSED";
  } else if (earnedPoints > 0) {
    status = "PARTIAL";
  } else {
    status = "FAILED";
  }

  const finalScore = isLate
    ? Math.round(percentage * (1 - homework.latePenalty / 100))
    : percentage;

  // 5. Save results
  // Set manualStatus to PENDING if manual review is required and tests passed (or no tests)
  const needsManualReview =
    homework.requiresManualReview &&
    (status === "PASSED" || homework.testCases.length === 0);

  await prisma.$transaction([
    prisma.submission.update({
      where: { id: submission.id },
      data: {
        status,
        score: earnedPoints,
        maxScore: totalPoints,
        percentage,
        finalScore,
        ...(needsManualReview && { manualStatus: "PENDING" as const }),
      },
    }),
    prisma.testResult.createMany({
      data: testResults.map((r) => ({
        submissionId: submission.id,
        testCaseId: r.testCaseId,
        passed: r.passed,
        actualOutput: r.actualOutput,
        errorOutput: r.error,
        executionTime: r.executionTime,
      })),
    }),
  ]);

  return {
    success: true as const,
    data: {
      submissionId: submission.id,
      courseId: homework.lesson.courseId,
      status,
      passed: testResults.filter((r) => r.passed).length,
      total: testResults.length,
      percentage,
      finalScore,
      testResults: testResults.map((r) => ({
        testCaseId: r.testCaseId,
        passed: r.passed,
        actualOutput: r.actualOutput,
        error: r.error,
        executionTime: r.executionTime,
      })),
    },
  };
}

// ---------- submitSolution (web) ----------
export async function submitSolution(homeworkId: string, code: string) {
  return withAuth(async (session) => {
    if (session.user.role !== "STUDENT") {
      return { success: false, error: "onlyStudentsCanSubmit" };
    }

    const result = await submitSolutionInternal(homeworkId, code, session.user.id);

    if (result.success) {
      revalidatePath(`/courses/${result.data.courseId}`);
    }

    return result;
  });
}

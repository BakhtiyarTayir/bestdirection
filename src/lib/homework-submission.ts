// Общая логика сдачи решения (веб + Telegram-бот).
// НЕ server action: файл без "use server", функция не публикуется наружу.
import { prisma } from "@/lib/prisma";
import { runAllTests } from "@/lib/code-runner/test-runner";

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

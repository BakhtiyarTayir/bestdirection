"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { QuestionType } from "@/generated/prisma";

// ---------- getTestByLessonId ----------
export async function getTestByLessonId(lessonId: string) {
  return withAuth(async (session) => {
    const test = await prisma.test.findUnique({
      where: { lessonId },
      include: {
        questions: {
          include: {
            options: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { sortOrder: "asc" },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            courseId: true,
            course: {
              select: { id: true, title: true, teacherId: true },
            },
          },
        },
      },
    });

    if (!test) return { success: false, error: "Test not found" };

    // For students, hide correct answer information
    if (session.user.role === "STUDENT") {
      const sanitizedTest = {
        ...test,
        questions: test.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            sortOrder: o.sortOrder,
            questionId: o.questionId,
          })),
        })),
      };
      return { success: true, data: sanitizedTest };
    }

    return { success: true, data: test };
  });
}

// ---------- createTest ----------
export async function createTest(data: {
  title: string;
  passingScore: number;
  timeLimitMin?: number;
  maxAttempts: number;
  isPublished: boolean;
  lessonId: string;
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const lesson = await prisma.lesson.findUnique({
        where: { id: data.lessonId },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!lesson) return { success: false, error: "Lesson not found" };

      if (role === "TEACHER" && lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only create tests for your own courses" };
      }

      const existingTest = await prisma.test.findUnique({
        where: { lessonId: data.lessonId },
      });

      if (existingTest) {
        return { success: false, error: "This lesson already has a test" };
      }

      const test = await prisma.test.create({
        data: {
          title: data.title,
          passingScore: data.passingScore,
          timeLimitMin: data.timeLimitMin,
          maxAttempts: data.maxAttempts,
          isPublished: data.isPublished,
          lessonId: data.lessonId,
        },
      });

      revalidatePath(`/dashboard/courses/${lesson.course.id}`);
      return { success: true, data: test };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateTest ----------
export async function updateTest(
  id: string,
  data: {
    title?: string;
    passingScore?: number;
    timeLimitMin?: number | null;
    maxAttempts?: number;
    isPublished?: boolean;
  }
) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.test.findUnique({
        where: { id },
        include: {
          lesson: {
            include: { course: { select: { teacherId: true, id: true } } },
          },
        },
      });

      if (!existing) return { success: false, error: "Test not found" };

      if (role === "TEACHER" && existing.lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only update tests in your own courses" };
      }

      const test = await prisma.test.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
          ...(data.timeLimitMin !== undefined && { timeLimitMin: data.timeLimitMin }),
          ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        },
      });

      revalidatePath(`/dashboard/courses/${existing.lesson.course.id}`);
      return { success: true, data: test };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteTest ----------
export async function deleteTest(id: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.test.findUnique({
        where: { id },
        include: {
          lesson: {
            include: { course: { select: { teacherId: true, id: true } } },
          },
        },
      });

      if (!existing) return { success: false, error: "Test not found" };

      if (role === "TEACHER" && existing.lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only delete tests in your own courses" };
      }

      await prisma.test.delete({ where: { id } });

      revalidatePath(`/dashboard/courses/${existing.lesson.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- addQuestion ----------
export async function addQuestion(data: {
  text: string;
  type: QuestionType;
  points: number;
  sortOrder: number;
  testId: string;
  options: { text: string; isCorrect: boolean; sortOrder: number }[];
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const test = await prisma.test.findUnique({
        where: { id: data.testId },
        include: {
          lesson: {
            include: { course: { select: { teacherId: true, id: true } } },
          },
        },
      });

      if (!test) return { success: false, error: "Test not found" };

      if (role === "TEACHER" && test.lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only add questions to your own tests" };
      }

      const question = await prisma.$transaction(async (tx) => {
        const createdQuestion = await tx.question.create({
          data: {
            text: data.text,
            type: data.type,
            points: data.points,
            sortOrder: data.sortOrder,
            testId: data.testId,
            options: {
              create: data.options.map((opt) => ({
                text: opt.text,
                isCorrect: opt.isCorrect,
                sortOrder: opt.sortOrder,
              })),
            },
          },
          include: {
            options: { orderBy: { sortOrder: "asc" } },
          },
        });

        return createdQuestion;
      });

      revalidatePath(`/dashboard/courses/${test.lesson.course.id}`);
      return { success: true, data: question };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateQuestion ----------
export async function updateQuestion(
  id: string,
  data: {
    text: string;
    type: QuestionType;
    points: number;
    sortOrder: number;
    options: { id?: string; text: string; isCorrect: boolean; sortOrder: number }[];
  }
) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.question.findUnique({
        where: { id },
        include: {
          test: {
            include: {
              lesson: {
                include: { course: { select: { teacherId: true, id: true } } },
              },
            },
          },
        },
      });

      if (!existing) return { success: false, error: "Question not found" };

      if (role === "TEACHER" && existing.test.lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only update questions in your own tests" };
      }

      const question = await prisma.$transaction(async (tx) => {
        await tx.answerOption.deleteMany({ where: { questionId: id } });

        const updatedQuestion = await tx.question.update({
          where: { id },
          data: {
            text: data.text,
            type: data.type,
            points: data.points,
            sortOrder: data.sortOrder,
            options: {
              create: data.options.map((opt) => ({
                text: opt.text,
                isCorrect: opt.isCorrect,
                sortOrder: opt.sortOrder,
              })),
            },
          },
          include: {
            options: { orderBy: { sortOrder: "asc" } },
          },
        });

        return updatedQuestion;
      });

      revalidatePath(`/dashboard/courses/${existing.test.lesson.course.id}`);
      return { success: true, data: question };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteQuestion ----------
export async function deleteQuestion(id: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.question.findUnique({
        where: { id },
        include: {
          test: {
            include: {
              lesson: {
                include: { course: { select: { teacherId: true, id: true } } },
              },
            },
          },
        },
      });

      if (!existing) return { success: false, error: "Question not found" };

      if (role === "TEACHER" && existing.test.lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only delete questions in your own tests" };
      }

      await prisma.question.delete({ where: { id } });

      revalidatePath(`/dashboard/courses/${existing.test.lesson.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- submitTestAttempt ----------
export async function submitTestAttempt(data: {
  testId: string;
  answers: { questionId: string; selectedOptionIds: string[] }[];
}) {
  return withAuth(async (session) => {
    if (session.user.role !== "STUDENT") {
      return { success: false, error: "Only students can submit test attempts" };
    }

    const studentId = session.user.id;

    const test = await prisma.test.findUnique({
      where: { id: data.testId },
      include: {
        questions: { include: { options: true } },
        lesson: { select: { courseId: true } },
      },
    });

    if (!test) return { success: false, error: "Test not found" };
    if (!test.isPublished) return { success: false, error: "Test is not published" };

    const existingAttempts = await prisma.testAttempt.count({
      where: { testId: data.testId, studentId },
    });

    if (existingAttempts >= test.maxAttempts) {
      return { success: false, error: "Maximum number of attempts reached" };
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: { studentId, courseId: test.lesson.courseId },
      },
    });

    if (!enrollment) {
      return { success: false, error: "You are not enrolled in this course" };
    }

    let totalScore = 0;
    let maxScore = 0;

    const answersWithScoring = data.answers.map((answer) => {
      const question = test.questions.find((q) => q.id === answer.questionId);
      if (!question) {
        return {
          questionId: answer.questionId,
          selectedOptionIds: answer.selectedOptionIds,
          isCorrect: false,
          pointsEarned: 0,
        };
      }

      maxScore += question.points;

      const correctOptionIds = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id)
        .sort();

      const selectedSorted = [...answer.selectedOptionIds].sort();

      const isCorrect =
        correctOptionIds.length === selectedSorted.length &&
        correctOptionIds.every((id, index) => id === selectedSorted[index]);

      const pointsEarned = isCorrect ? question.points : 0;
      totalScore += pointsEarned;

      return {
        questionId: answer.questionId,
        selectedOptionIds: answer.selectedOptionIds,
        isCorrect,
        pointsEarned,
      };
    });

    const answeredQuestionIds = new Set(data.answers.map((a) => a.questionId));
    for (const question of test.questions) {
      if (!answeredQuestionIds.has(question.id)) {
        maxScore += question.points;
      }
    }

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const isPassed = percentage >= test.passingScore;

    const attempt = await prisma.$transaction(async (tx) => {
      const testAttempt = await tx.testAttempt.create({
        data: {
          score: totalScore,
          maxScore,
          percentage,
          isPassed,
          completedAt: new Date(),
          studentId,
          testId: data.testId,
          answers: {
            create: answersWithScoring.map((a) => ({
              questionId: a.questionId,
              selectedOptionIds: a.selectedOptionIds,
              isCorrect: a.isCorrect,
              pointsEarned: a.pointsEarned,
            })),
          },
        },
        include: { answers: true },
      });

      return testAttempt;
    });

    revalidatePath(`/dashboard/courses/${test.lesson.courseId}`);
    return { success: true, data: attempt };
  });
}

// ---------- getTestAttempts ----------
export async function getTestAttempts(testId: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    let where: { testId: string; studentId?: string };

    if (role === "STUDENT") {
      where = { testId, studentId: session.user.id };
    } else {
      where = { testId };
    }

    const attempts = await prisma.testAttempt.findMany({
      where,
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        answers: {
          include: {
            question: {
              select: { id: true, text: true, points: true },
            },
          },
        },
      },
      orderBy: { startedAt: "desc" },
    });

    return { success: true, data: attempts };
  });
}

// ---------- getStudentResults ----------
export async function getStudentResults(studentId?: string) {
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

    const attempts = await prisma.testAttempt.findMany({
      where: { studentId: targetStudentId },
      include: {
        test: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            maxAttempts: true,
            lesson: {
              select: {
                id: true,
                title: true,
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
        student: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { startedAt: "desc" },
    });

    return { success: true, data: attempts };
  });
}

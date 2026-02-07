"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { QuestionType } from "@/generated/prisma";

// ---------- getExamsByCourse ----------
export async function getExamsByCourse(courseId: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    const exams = await prisma.exam.findMany({
      where: {
        courseId,
        ...(role === "STUDENT" ? { isPublished: true } : {}),
      },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return { success: true, data: exams };
  });
}

// ---------- getExamById ----------
export async function getExamById(examId: string) {
  return withAuth(async (session) => {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        questions: {
          include: {
            options: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!exam) return { success: false, error: "Exam not found" };

    // For students, hide correct answer information
    if (session.user.role === "STUDENT") {
      const sanitizedExam = {
        ...exam,
        questions: exam.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            sortOrder: o.sortOrder,
            questionId: o.questionId,
          })),
        })),
      };
      return { success: true, data: sanitizedExam };
    }

    return { success: true, data: exam };
  });
}

// ---------- createExam ----------
export async function createExam(data: {
  title: string;
  description?: string;
  passingScore: number;
  timeLimitMin?: number;
  maxAttempts: number;
  isPublished: boolean;
  courseId: string;
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const course = await prisma.course.findUnique({
        where: { id: data.courseId },
        select: { id: true, teacherId: true },
      });

      if (!course) return { success: false, error: "Course not found" };

      if (role === "TEACHER" && course.teacherId !== session.user.id) {
        return { success: false, error: "You can only create exams for your own courses" };
      }

      const exam = await prisma.exam.create({
        data: {
          title: data.title,
          description: data.description,
          passingScore: data.passingScore,
          timeLimitMin: data.timeLimitMin,
          maxAttempts: data.maxAttempts,
          isPublished: data.isPublished,
          courseId: data.courseId,
        },
      });

      revalidatePath(`/courses/${data.courseId}`);
      return { success: true, data: exam };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateExam ----------
export async function updateExam(
  id: string,
  data: {
    title?: string;
    description?: string | null;
    passingScore?: number;
    timeLimitMin?: number | null;
    maxAttempts?: number;
    isPublished?: boolean;
  }
) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.exam.findUnique({
        where: { id },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!existing) return { success: false, error: "Exam not found" };

      if (role === "TEACHER" && existing.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only update exams in your own courses" };
      }

      const exam = await prisma.exam.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
          ...(data.timeLimitMin !== undefined && { timeLimitMin: data.timeLimitMin }),
          ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        },
      });

      revalidatePath(`/courses/${existing.course.id}`);
      return { success: true, data: exam };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteExam ----------
export async function deleteExam(id: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.exam.findUnique({
        where: { id },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!existing) return { success: false, error: "Exam not found" };

      if (role === "TEACHER" && existing.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only delete exams in your own courses" };
      }

      await prisma.exam.delete({ where: { id } });

      revalidatePath(`/courses/${existing.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- addExamQuestion ----------
export async function addExamQuestion(data: {
  text: string;
  type: QuestionType;
  points: number;
  sortOrder: number;
  examId: string;
  options: { text: string; isCorrect: boolean; sortOrder: number }[];
}) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const exam = await prisma.exam.findUnique({
        where: { id: data.examId },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!exam) return { success: false, error: "Exam not found" };

      if (role === "TEACHER" && exam.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only add questions to your own exams" };
      }

      const question = await prisma.examQuestion.create({
        data: {
          text: data.text,
          type: data.type,
          points: data.points,
          sortOrder: data.sortOrder,
          examId: data.examId,
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

      revalidatePath(`/courses/${exam.course.id}`);
      return { success: true, data: question };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateExamQuestion ----------
export async function updateExamQuestion(
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

      const existing = await prisma.examQuestion.findUnique({
        where: { id },
        include: {
          exam: {
            include: { course: { select: { teacherId: true, id: true } } },
          },
        },
      });

      if (!existing) return { success: false, error: "Question not found" };

      if (role === "TEACHER" && existing.exam.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only update questions in your own exams" };
      }

      const question = await prisma.$transaction(async (tx) => {
        await tx.examAnswerOption.deleteMany({ where: { questionId: id } });

        const updatedQuestion = await tx.examQuestion.update({
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

      revalidatePath(`/courses/${existing.exam.course.id}`);
      return { success: true, data: question };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteExamQuestion ----------
export async function deleteExamQuestion(id: string) {
  return withAuth(
    async (session) => {
      const role = session.user.role;

      const existing = await prisma.examQuestion.findUnique({
        where: { id },
        include: {
          exam: {
            include: { course: { select: { teacherId: true, id: true } } },
          },
        },
      });

      if (!existing) return { success: false, error: "Question not found" };

      if (role === "TEACHER" && existing.exam.course.teacherId !== session.user.id) {
        return { success: false, error: "You can only delete questions in your own exams" };
      }

      await prisma.examQuestion.delete({ where: { id } });

      revalidatePath(`/courses/${existing.exam.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- checkExamEligibility ----------
export async function checkExamEligibility(examId: string) {
  return withAuth(async (session) => {
    if (session.user.role !== "STUDENT") {
      return { success: true, data: { eligible: true, unpassedTests: [] as { lessonTitle: string; testTitle: string }[] } };
    }

    const studentId = session.user.id;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { courseId: true },
    });

    if (!exam) return { success: false, error: "Exam not found" };

    // Find all published lessons with published tests for this course
    const lessonsWithTests = await prisma.lesson.findMany({
      where: {
        courseId: exam.courseId,
        isPublished: true,
        test: { isPublished: true },
      },
      include: {
        test: {
          select: { id: true, title: true },
        },
      },
    });

    const unpassedTests: { lessonTitle: string; testTitle: string }[] = [];

    for (const lesson of lessonsWithTests) {
      if (!lesson.test) continue;

      const passedAttempt = await prisma.testAttempt.findFirst({
        where: {
          testId: lesson.test.id,
          studentId,
          isPassed: true,
        },
      });

      if (!passedAttempt) {
        unpassedTests.push({
          lessonTitle: lesson.title,
          testTitle: lesson.test.title,
        });
      }
    }

    return {
      success: true,
      data: {
        eligible: unpassedTests.length === 0,
        unpassedTests,
      },
    };
  });
}

// ---------- submitExamAttempt ----------
export async function submitExamAttempt(data: {
  examId: string;
  answers: { questionId: string; selectedOptionIds: string[] }[];
}) {
  return withAuth(async (session) => {
    if (session.user.role !== "STUDENT") {
      return { success: false, error: "Only students can submit exam attempts" };
    }

    const studentId = session.user.id;

    const exam = await prisma.exam.findUnique({
      where: { id: data.examId },
      include: {
        questions: { include: { options: true } },
        course: { select: { id: true } },
      },
    });

    if (!exam) return { success: false, error: "Exam not found" };
    if (!exam.isPublished) return { success: false, error: "Exam is not published" };

    // Check enrollment
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: { studentId, courseId: exam.courseId },
      },
    });

    if (!enrollment) {
      return { success: false, error: "You are not enrolled in this course" };
    }

    // Check eligibility
    const eligibilityResult = await checkExamEligibility(data.examId);
    if (!eligibilityResult.success) {
      return { success: false, error: eligibilityResult.error || "Failed to check eligibility" };
    }
    if (!eligibilityResult.data?.eligible) {
      return { success: false, error: "Вы должны пройти все тесты уроков перед экзаменом" };
    }

    // Check max attempts
    const existingAttempts = await prisma.examAttempt.count({
      where: { examId: data.examId, studentId },
    });

    if (existingAttempts >= exam.maxAttempts) {
      return { success: false, error: "Maximum number of attempts reached" };
    }

    // Score the attempt
    let totalScore = 0;
    let maxScore = 0;

    const answersWithScoring = data.answers.map((answer) => {
      const question = exam.questions.find((q) => q.id === answer.questionId);
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

    // Account for unanswered questions
    const answeredQuestionIds = new Set(data.answers.map((a) => a.questionId));
    for (const question of exam.questions) {
      if (!answeredQuestionIds.has(question.id)) {
        maxScore += question.points;
      }
    }

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const isPassed = percentage >= exam.passingScore;

    const attempt = await prisma.examAttempt.create({
      data: {
        score: totalScore,
        maxScore,
        percentage,
        isPassed,
        completedAt: new Date(),
        studentId,
        examId: data.examId,
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

    revalidatePath(`/courses/${exam.courseId}`);
    return { success: true, data: attempt };
  });
}

// ---------- getExamAttempts ----------
export async function getExamAttempts(examId: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    let where: { examId: string; studentId?: string };

    if (role === "STUDENT") {
      where = { examId, studentId: session.user.id };
    } else {
      where = { examId };
    }

    const attempts = await prisma.examAttempt.findMany({
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

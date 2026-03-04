"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { createAuditLog, computeChanges } from "@/lib/audit";
import type { QuestionType, AssessmentType } from "@/validators/assessment";

// ---------- Helper: validate teacher ownership ----------
async function validateCourseOwnership(
  courseId: string,
  userId: string,
  role: string
): Promise<{ success: boolean; error?: string; teacherId?: string }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, teacherId: true },
  });
  if (!course) return { success: false, error: "courseNotFound" };
  if (role === "TEACHER" && course.teacherId !== userId) {
    return { success: false, error: "onlyOwnCourses" };
  }
  return { success: true, teacherId: course.teacherId };
}

// ---------- getAssessment ----------
export async function getAssessment(assessmentId: string) {
  return withAuth(async (session) => {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        lesson: { select: { id: true, title: true } },
        questions: {
          include: {
            options: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!assessment) return { success: false, error: "assessmentNotFound" };

    // For students, hide correct answer info
    if (session.user.role === "STUDENT") {
      const sanitized = {
        ...assessment,
        questions: assessment.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            sortOrder: o.sortOrder,
            questionId: o.questionId,
          })),
        })),
      };
      return { success: true, data: sanitized };
    }

    return { success: true, data: assessment };
  });
}

// ---------- getTestByLesson ----------
export async function getTestByLesson(lessonId: string) {
  return withAuth(async (session) => {
    const assessment = await prisma.assessment.findUnique({
      where: { lessonId },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        lesson: { select: { id: true, title: true } },
        questions: {
          include: {
            options: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!assessment) return { success: false, error: "testNotFound" };

    if (session.user.role === "STUDENT") {
      const sanitized = {
        ...assessment,
        questions: assessment.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            sortOrder: o.sortOrder,
            questionId: o.questionId,
          })),
        })),
      };
      return { success: true, data: sanitized };
    }

    return { success: true, data: assessment };
  });
}

// ---------- getExamsByCourse ----------
export async function getAssessmentsByCourse(courseId: string, type?: AssessmentType) {
  return withAuth(async (session) => {
    const role = session.user.role;

    const assessments = await prisma.assessment.findMany({
      where: {
        courseId,
        ...(type ? { type } : {}),
        ...(role === "STUDENT" ? { isPublished: true } : {}),
      },
      include: {
        lesson: { select: { id: true, title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return { success: true, data: assessments };
  });
}

// ---------- createAssessment ----------
export async function createAssessment(data: {
  type: AssessmentType;
  title: string;
  description?: string;
  passingScore: number;
  timeLimitMin?: number;
  maxAttempts: number;
  isPublished: boolean;
  courseId: string;
  lessonId?: string;
}) {
  return withAuth(
    async (session) => {
      const ownership = await validateCourseOwnership(data.courseId, session.user.id, session.user.role);
      if (!ownership.success) return { success: false, error: ownership.error! };

      // TEST requires a lesson
      if (data.type === "TEST") {
        if (!data.lessonId) {
          return { success: false, error: "testRequiresLesson" };
        }
        const lesson = await prisma.lesson.findUnique({
          where: { id: data.lessonId },
          select: { id: true, courseId: true },
        });
        if (!lesson) return { success: false, error: "lessonNotFound" };
        if (lesson.courseId !== data.courseId) {
          return { success: false, error: "lessonNotInCourse" };
        }
        // Check uniqueness: one test per lesson
        const existing = await prisma.assessment.findUnique({
          where: { lessonId: data.lessonId },
        });
        if (existing) {
          return { success: false, error: "lessonAlreadyHasTest" };
        }
      }

      const assessment = await prisma.assessment.create({
        data: {
          type: data.type,
          title: data.title,
          description: data.description,
          passingScore: data.passingScore,
          timeLimitMin: data.timeLimitMin,
          maxAttempts: data.maxAttempts,
          isPublished: data.isPublished,
          courseId: data.courseId,
          lessonId: data.type === "TEST" ? data.lessonId : null,
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Assessment",
        entityId: assessment.id,
        action: "CREATE",
        metadata: { title: assessment.title, type: assessment.type, courseId: data.courseId },
      });

      revalidatePath(`/courses/${data.courseId}`);
      return { success: true, data: assessment };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateAssessment ----------
export async function updateAssessment(
  id: string,
  data: {
    title?: string;
    description?: string | null;
    passingScore?: number;
    timeLimitMin?: number | null;
    maxAttempts?: number;
    sortOrder?: number;
    isPublished?: boolean;
  }
) {
  return withAuth(
    async (session) => {
      const existing = await prisma.assessment.findUnique({
        where: { id },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!existing) return { success: false, error: "assessmentNotFound" };

      if (session.user.role === "TEACHER" && existing.course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnCourses" };
      }

      const assessment = await prisma.assessment.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
          ...(data.timeLimitMin !== undefined && { timeLimitMin: data.timeLimitMin }),
          ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        },
      });

      const changes = computeChanges(
        { title: existing.title, passingScore: existing.passingScore, timeLimitMin: existing.timeLimitMin, maxAttempts: existing.maxAttempts, isPublished: existing.isPublished },
        data
      );
      if (changes) {
        await createAuditLog({
          userId: session.user.id,
          entityType: "Assessment",
          entityId: id,
          action: "UPDATE",
          changes,
        });
      }

      revalidatePath(`/courses/${existing.course.id}`);
      return { success: true, data: assessment };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteAssessment ----------
export async function deleteAssessment(id: string) {
  return withAuth(
    async (session) => {
      const existing = await prisma.assessment.findUnique({
        where: { id },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!existing) return { success: false, error: "assessmentNotFound" };

      if (session.user.role === "TEACHER" && existing.course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnCourses" };
      }

      await prisma.assessment.delete({ where: { id } });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Assessment",
        entityId: id,
        action: "DELETE",
        metadata: { title: existing.title, type: existing.type, courseId: existing.course.id },
      });

      revalidatePath(`/courses/${existing.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- addAssessmentQuestion ----------
export async function addAssessmentQuestion(data: {
  text: string;
  type: QuestionType;
  points: number;
  sortOrder: number;
  assessmentId: string;
  options: { text: string; isCorrect: boolean; sortOrder: number }[];
}) {
  return withAuth(
    async (session) => {
      const assessment = await prisma.assessment.findUnique({
        where: { id: data.assessmentId },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!assessment) return { success: false, error: "assessmentNotFound" };

      if (session.user.role === "TEACHER" && assessment.course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnCourses" };
      }

      const question = await prisma.assessmentQuestion.create({
        data: {
          text: data.text,
          type: data.type,
          points: data.points,
          sortOrder: data.sortOrder,
          assessmentId: data.assessmentId,
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

      revalidatePath(`/courses/${assessment.course.id}`);
      return { success: true, data: question };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateAssessmentQuestion ----------
export async function updateAssessmentQuestion(
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
      const existing = await prisma.assessmentQuestion.findUnique({
        where: { id },
        include: {
          assessment: {
            include: { course: { select: { teacherId: true, id: true } } },
          },
        },
      });

      if (!existing) return { success: false, error: "questionNotFound" };

      if (session.user.role === "TEACHER" && existing.assessment.course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnCourses" };
      }

      const question = await prisma.$transaction(async (tx) => {
        await tx.assessmentAnswerOption.deleteMany({ where: { questionId: id } });

        const updatedQuestion = await tx.assessmentQuestion.update({
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

      revalidatePath(`/courses/${existing.assessment.course.id}`);
      return { success: true, data: question };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteAssessmentQuestion ----------
export async function deleteAssessmentQuestion(id: string) {
  return withAuth(
    async (session) => {
      const existing = await prisma.assessmentQuestion.findUnique({
        where: { id },
        include: {
          assessment: {
            include: { course: { select: { teacherId: true, id: true } } },
          },
        },
      });

      if (!existing) return { success: false, error: "questionNotFound" };

      if (session.user.role === "TEACHER" && existing.assessment.course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnCourses" };
      }

      await prisma.assessmentQuestion.delete({ where: { id } });

      revalidatePath(`/courses/${existing.assessment.course.id}`);
      return { success: true };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- checkExamEligibility ----------
export async function checkAssessmentEligibility(assessmentId: string) {
  return withAuth(async (session) => {
    if (session.user.role !== "STUDENT") {
      return { success: true, data: { eligible: true, unpassedTests: [] as { lessonTitle: string; testTitle: string }[] } };
    }

    const studentId = session.user.id;

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { courseId: true, type: true },
    });

    if (!assessment) return { success: false, error: "assessmentNotFound" };

    // Only exams require eligibility check (all lesson tests must be passed)
    if (assessment.type === "TEST") {
      return { success: true, data: { eligible: true, unpassedTests: [] as { lessonTitle: string; testTitle: string }[] } };
    }

    // Find all published lesson-bound assessments (tests) for this course
    const lessonTests = await prisma.assessment.findMany({
      where: {
        courseId: assessment.courseId,
        type: "TEST",
        isPublished: true,
        lessonId: { not: null },
      },
      include: {
        lesson: { select: { title: true } },
      },
    });

    const unpassedTests: { lessonTitle: string; testTitle: string }[] = [];

    for (const test of lessonTests) {
      const passedAttempt = await prisma.assessmentAttempt.findFirst({
        where: {
          assessmentId: test.id,
          studentId,
          isPassed: true,
        },
      });

      if (!passedAttempt) {
        unpassedTests.push({
          lessonTitle: test.lesson?.title ?? "",
          testTitle: test.title,
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

// ---------- submitAssessmentAttempt ----------
export async function submitAssessmentAttempt(data: {
  assessmentId: string;
  answers: { questionId: string; selectedOptionIds: string[] }[];
}) {
  return withAuth(async (session) => {
    if (session.user.role !== "STUDENT") {
      return { success: false, error: "onlyStudentsCanTake" };
    }

    const studentId = session.user.id;

    const assessment = await prisma.assessment.findUnique({
      where: { id: data.assessmentId },
      include: {
        questions: { include: { options: true } },
        course: { select: { id: true } },
      },
    });

    if (!assessment) return { success: false, error: "assessmentNotFound" };
    if (!assessment.isPublished) return { success: false, error: "assessmentNotPublished" };

    // Check enrollment
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: { studentId, courseId: assessment.courseId },
      },
    });

    if (!enrollment) {
      return { success: false, error: "notEnrolled" };
    }

    // Score the attempt
    let totalScore = 0;
    let maxScore = 0;

    const answersWithScoring = data.answers.map((answer) => {
      const question = assessment.questions.find((q) => q.id === answer.questionId);
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
    for (const question of assessment.questions) {
      if (!answeredQuestionIds.has(question.id)) {
        maxScore += question.points;
      }
    }

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const isPassed = percentage >= assessment.passingScore;

    // Race condition protection: check attempt count inside transaction
    let attempt;
    try {
      attempt = await prisma.$transaction(async (tx) => {
        const existingAttempts = await tx.assessmentAttempt.count({
          where: { assessmentId: data.assessmentId, studentId },
        });

        if (existingAttempts >= assessment.maxAttempts) {
          throw new Error("MAX_ATTEMPTS_REACHED");
        }

        return await tx.assessmentAttempt.create({
          data: {
            score: totalScore,
            maxScore,
            percentage,
            isPassed,
            completedAt: new Date(),
            studentId,
            assessmentId: data.assessmentId,
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
      });
    } catch (error) {
      if (error instanceof Error && error.message === "MAX_ATTEMPTS_REACHED") {
        return { success: false, error: "maxAttemptsReached" };
      }
      throw error;
    }

    revalidatePath(`/courses/${assessment.courseId}`);
    return { success: true, data: attempt };
  });
}

// ---------- getAssessmentAttempts ----------
export async function getAssessmentAttempts(assessmentId: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    const where: { assessmentId: string; studentId?: string } =
      role === "STUDENT"
        ? { assessmentId, studentId: session.user.id }
        : { assessmentId };

    const attempts = await prisma.assessmentAttempt.findMany({
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

// ---------- getStudentAssessmentResults ----------
export async function getStudentAssessmentResults(studentId?: string) {
  return withAuth(async (session) => {
    const role = session.user.role;

    let targetStudentId: string;

    if (role === "STUDENT") {
      targetStudentId = session.user.id;
    } else if (studentId) {
      targetStudentId = studentId;
    } else {
      return { success: false, error: "studentIdRequired" };
    }

    const attempts = await prisma.assessmentAttempt.findMany({
      where: { studentId: targetStudentId },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            type: true,
            passingScore: true,
            maxAttempts: true,
            lesson: {
              select: {
                id: true,
                title: true,
              },
            },
            course: { select: { id: true, title: true } },
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

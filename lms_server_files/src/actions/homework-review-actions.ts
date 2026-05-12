"use server";

import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { executeCode } from "@/lib/code-runner/executor";
import { detectLanguageFromExtension } from "@/lib/code-runner/config";
import { ManualReviewStatus } from "@/generated/prisma";

// ---------- reviewSubmission ----------
export async function reviewSubmission(
  submissionId: string,
  data: {
    status: "APPROVED" | "REJECTED" | "REVISION";
    comment?: string;
    manualScore?: number;
  }
) {
  return withAuth(
    async (session) => {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          homework: {
            include: {
              lesson: {
                include: {
                  course: { select: { teacherId: true } },
                },
              },
            },
          },
        },
      });

      if (!submission) {
        return { success: false as const, error: "Submission not found" };
      }

      // Check that teacher owns the course (or is admin)
      if (
        session.user.role !== "ADMIN" &&
        submission.homework.lesson.course.teacherId !== session.user.id
      ) {
        return { success: false as const, error: "Forbidden" };
      }

      const updated = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          manualStatus: data.status as ManualReviewStatus,
          teacherComment: data.comment || null,
          manualScore: data.manualScore ?? null,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      });

      return { success: true as const, data: updated };
    },
    { roles: ["TEACHER", "ADMIN"] }
  );
}

// ---------- runStudentCode ----------
export async function runStudentCode(
  submissionId: string,
  stdin?: string,
  codeOverride?: string
) {
  return withAuth(
    async (session) => {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          homework: {
            select: {
              language: true,
              timeLimitSec: true,
              lesson: {
                select: {
                  course: { select: { teacherId: true } },
                },
              },
            },
          },
          files: {
            select: { id: true, filename: true, path: true },
          },
        },
      });

      if (!submission) {
        return { success: false as const, error: "Submission not found" };
      }

      if (
        session.user.role !== "ADMIN" &&
        submission.homework.lesson.course.teacherId !== session.user.id
      ) {
        return { success: false as const, error: "Forbidden" };
      }

      const language =
        submission.homework.language ||
        (submission.files[0] ? detectLanguageFromExtension(submission.files[0].filename) : null);

      if (!language) {
        return { success: false as const, error: "Не удалось определить язык" };
      }

      let code: string;
      if (codeOverride !== undefined) {
        code = codeOverride;
      } else if (submission.homework.language) {
        code = submission.code;
      } else {
        code = await readFile(submission.files[0].path, "utf-8");
      }

      const result = await executeCode(
        language,
        code,
        (submission.homework.timeLimitSec || 5) * 1000,
        stdin
      );

      return { success: true as const, data: result };
    },
    { roles: ["TEACHER", "ADMIN"] }
  );
}

// ---------- getStudentHomeworks ----------
export async function getStudentHomeworks() {
  return withAuth(
    async (session) => {
      // Get all courses the student is enrolled in
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: session.user.id },
        select: { courseId: true },
      });
      const courseIds = enrollments.map((e) => e.courseId);

      if (courseIds.length === 0) {
        return { success: true as const, data: [] };
      }

      // Get all published homeworks from enrolled courses with latest submission
      const homeworks = await prisma.homework.findMany({
        where: {
          isPublished: true,
          lesson: {
            courseId: { in: courseIds },
            isPublished: true,
            deletedAt: null,
          },
        },
        include: {
          lesson: {
            select: {
              id: true,
              slug: true,
              title: true,
              course: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                },
              },
            },
          },
          submissions: {
            where: { studentId: session.user.id },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              manualStatus: true,
              percentage: true,
              attemptNumber: true,
              teacherComment: true,
              createdAt: true,
            },
          },
          _count: {
            select: { testCases: true },
          },
        },
        orderBy: [
          { lesson: { course: { title: "asc" } } },
          { dueDate: "asc" },
        ],
      });

      return { success: true as const, data: homeworks };
    },
    { roles: ["STUDENT"] }
  );
}

// ---------- getPendingReviewSubmissions ----------
export async function getPendingReviewSubmissions() {
  return withAuth(
    async (session) => {
      const where =
        session.user.role === "ADMIN"
          ? {}
          : { homework: { lesson: { course: { teacherId: session.user.id } } } };

      const submissions = await prisma.submission.findMany({
        where: {
          manualStatus: "PENDING",
          ...where,
        },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          homework: {
            select: {
              id: true,
              slug: true,
              title: true,
              type: true,
              language: true,
              requiresManualReview: true,
              lesson: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  course: {
                    select: { id: true, slug: true, title: true },
                  },
                },
              },
              _count: { select: { testCases: true } },
            },
          },
          testResults: {
            select: { passed: true },
          },
          files: {
            select: { id: true, filename: true, size: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return { success: true as const, data: submissions };
    },
    { roles: ["TEACHER", "ADMIN"] }
  );
}

// ---------- getReviewHistory ----------
export async function getReviewHistory() {
  return withAuth(
    async (session) => {
      const where =
        session.user.role === "ADMIN"
          ? {}
          : { reviewedById: session.user.id };

      const submissions = await prisma.submission.findMany({
        where: {
          manualStatus: { in: ["APPROVED", "REJECTED", "REVISION"] },
          ...where,
        },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          homework: {
            select: {
              id: true,
              slug: true,
              title: true,
              type: true,
              lesson: {
                select: {
                  slug: true,
                  title: true,
                  course: { select: { slug: true, title: true } },
                },
              },
            },
          },
          reviewedBy: {
            select: { firstName: true, lastName: true },
          },
        },
        orderBy: { reviewedAt: "desc" },
        take: 50,
      });

      return { success: true as const, data: submissions };
    },
    { roles: ["TEACHER", "ADMIN"] }
  );
}

// ---------- getSubmissionForReview ----------
export async function getSubmissionForReview(submissionId: string) {
  return withAuth(
    async (session) => {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          homework: {
            include: {
              lesson: {
                select: {
                  slug: true,
                  title: true,
                  course: {
                    select: { slug: true, title: true, teacherId: true },
                  },
                },
              },
              testCases: {
                select: { id: true, description: true, isHidden: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
          testResults: {
            include: {
              testCase: {
                select: { description: true, expected: true, input: true, isHidden: true },
              },
            },
          },
          files: true,
          reviewedBy: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      if (!submission) {
        return { success: false as const, error: "Submission not found" };
      }

      // Check access
      if (
        session.user.role !== "ADMIN" &&
        submission.homework.lesson.course.teacherId !== session.user.id
      ) {
        return { success: false as const, error: "Forbidden" };
      }

      return { success: true as const, data: submission };
    },
    { roles: ["TEACHER", "ADMIN"] }
  );
}

// ---------- getHomeworkCounts ----------
export async function getHomeworkCounts() {
  return withAuth(async (session) => {
    if (session.user.role === "STUDENT") {
      // Count homeworks that need to be done or revised
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: session.user.id },
        select: { courseId: true },
      });
      const courseIds = enrollments.map((e) => e.courseId);

      if (courseIds.length === 0) {
        return { success: true as const, data: { count: 0 } };
      }

      const homeworks = await prisma.homework.findMany({
        where: {
          isPublished: true,
          lesson: {
            courseId: { in: courseIds },
            isPublished: true,
            deletedAt: null,
          },
        },
        select: {
          id: true,
          requiresManualReview: true,
          dueDate: true,
          submissions: {
            where: { studentId: session.user.id },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, manualStatus: true },
          },
        },
      });

      let count = 0;
      const now = new Date();
      for (const hw of homeworks) {
        const sub = hw.submissions[0];
        if (!sub) {
          // No submission yet — needs to be done
          if (!hw.dueDate || hw.dueDate > now) count++;
          continue;
        }
        if (sub.manualStatus === "REVISION") {
          count++;
          continue;
        }
        // Not completed: auto-only and not passed, or requires manual and not approved
        const isCompleted =
          (sub.status === "PASSED" && !hw.requiresManualReview) ||
          sub.manualStatus === "APPROVED";
        if (!isCompleted && sub.manualStatus !== "PENDING") {
          if (!hw.dueDate || hw.dueDate > now) count++;
        }
      }

      return { success: true as const, data: { count } };
    } else {
      // TEACHER or ADMIN — count pending review submissions
      const where =
        session.user.role === "ADMIN"
          ? {}
          : { homework: { lesson: { course: { teacherId: session.user.id } } } };

      const count = await prisma.submission.count({
        where: {
          manualStatus: "PENDING",
          ...where,
        },
      });

      return { success: true as const, data: { count } };
    }
  });
}

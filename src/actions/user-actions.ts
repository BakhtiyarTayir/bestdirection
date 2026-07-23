"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog, computeChanges } from "@/lib/audit";
import bcrypt from "bcryptjs";
import type { Role } from "@/validators/user";

export type HomeworkSubmissionState =
  | "ALL"
  | "PASSED"
  | "FAILED"
  | "NOT_SUBMITTED";

const ONLINE_WINDOW_MINUTES = 5;

// ---------- getUsers ----------
export async function getUsers() {
  return withAuth(
    async (session) => {
      const where =
        session.user.role === "TEACHER"
          ? { deletedAt: null, role: "STUDENT" as const }
          : { deletedAt: null };

      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          number: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return { success: true, data: users };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getUsersHomeworkStatistics ----------
export async function getUsersHomeworkStatistics(filters: {
  courseId?: string;
  homeworkId?: string;
  groupId?: string;
  submissionState?: HomeworkSubmissionState;
}) {
  return withAuth(
    async (session) => {
      const courseWhere =
        session.user.role === "TEACHER"
          ? { teacherId: session.user.id, deletedAt: null }
          : { deletedAt: null };

      const courses = await prisma.course.findMany({
        where: courseWhere,
        select: { id: true, title: true, slug: true },
        orderBy: { title: "asc" },
      });

      const selectedCourseId =
        filters.courseId && courses.some((c) => c.id === filters.courseId)
          ? filters.courseId
          : undefined;

      const emptySummary = {
        totalStudents: 0,
        passedCount: 0,
        failedCount: 0,
        notSubmittedCount: 0,
        averageBestPercent: 0,
        onlineNowCount: 0,
      };

      if (!selectedCourseId) {
        return {
          success: true as const,
          data: {
            courses,
            homeworks: [],
            groups: [],
            summary: emptySummary,
            rows: [],
          },
        };
      }

      const [homeworks, groups] = await Promise.all([
        prisma.homework.findMany({
          where: {
            isPublished: true,
            lesson: { courseId: selectedCourseId },
          },
          select: {
            id: true,
            title: true,
            passingScore: true,
            requiresManualReview: true,
            lesson: { select: { title: true } },
          },
          orderBy: [
            { lesson: { sortOrder: "asc" } },
            { sortOrder: "asc" },
          ],
        }),
        prisma.group.findMany({
          where: { courseId: selectedCourseId },
          select: { id: true, name: true },
          orderBy: { sortOrder: "asc" },
        }),
      ]);

      const selectedHomework =
        filters.homeworkId && homeworks.find((h) => h.id === filters.homeworkId)
          ? homeworks.find((h) => h.id === filters.homeworkId)!
          : null;

      const selectedGroupId =
        filters.groupId && groups.some((g) => g.id === filters.groupId)
          ? filters.groupId
          : undefined;

      const selectedSubmissionState: HomeworkSubmissionState =
        filters.submissionState === "PASSED" ||
        filters.submissionState === "FAILED" ||
        filters.submissionState === "NOT_SUBMITTED"
          ? filters.submissionState
          : "ALL";

      if (!selectedHomework) {
        return {
          success: true as const,
          data: {
            courses,
            homeworks,
            groups,
            summary: emptySummary,
            rows: [],
          },
        };
      }

      const enrollments = await prisma.enrollment.findMany({
        where: {
          courseId: selectedCourseId,
          student: {
            deletedAt: null,
            isActive: true,
          },
          ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
        },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              isActive: true,
              lastSeenAt: true,
            },
          },
          group: { select: { id: true, name: true } },
        },
      });

      const studentIds = enrollments.map((e) => e.student.id);
      const submissions = studentIds.length
        ? await prisma.submission.findMany({
            where: {
              homeworkId: selectedHomework.id,
              studentId: { in: studentIds },
            },
            select: {
              id: true,
              studentId: true,
              status: true,
              percentage: true,
              finalScore: true,
              manualStatus: true,
              manualScore: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : [];

      const submissionsByStudent = new Map<
        string,
        Array<{
          id: string;
          status: string;
          percentage: number;
          finalScore: number;
          manualStatus: string | null;
          manualScore: number | null;
          createdAt: Date;
        }>
      >();

      for (const sub of submissions) {
        const list = submissionsByStudent.get(sub.studentId) || [];
        list.push({
          id: sub.id,
          status: sub.status,
          percentage: Number(sub.percentage),
          finalScore: Number(sub.finalScore),
          manualStatus: sub.manualStatus,
          manualScore: sub.manualScore,
          createdAt: sub.createdAt,
        });
        submissionsByStudent.set(sub.studentId, list);
      }

      const onlineThreshold = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000);

      const baseRows = enrollments.map((enrollment) => {
        const studentSubs = submissionsByStudent.get(enrollment.student.id) || [];
        const hasSubmission = studentSubs.length > 0;
        const isOnlineNow =
          enrollment.student.isActive &&
          enrollment.student.lastSeenAt !== null &&
          enrollment.student.lastSeenAt >= onlineThreshold;

        const bestPercent = hasSubmission
          ? Math.round(
              Math.max(
                ...studentSubs.map((s) =>
                  s.manualScore !== null ? s.manualScore : s.finalScore
                )
              )
            )
          : 0;

        const hasManualApproved = studentSubs.some(
          (s) => s.manualStatus === "APPROVED"
        );
        const hasAutoPassed = studentSubs.some(
          (s) =>
            s.status === "PASSED" ||
            (s.manualScore !== null
              ? s.manualScore >= selectedHomework.passingScore
              : s.finalScore >= selectedHomework.passingScore)
        );

        const isPassed = hasSubmission
          ? selectedHomework.requiresManualReview
            ? hasManualApproved
            : hasManualApproved || hasAutoPassed
          : false;

        const submissionState: Exclude<HomeworkSubmissionState, "ALL"> =
          !hasSubmission ? "NOT_SUBMITTED" : isPassed ? "PASSED" : "FAILED";

        const lastSubmittedAt = hasSubmission
          ? studentSubs.reduce(
              (latest, current) =>
                current.createdAt > latest ? current.createdAt : latest,
              studentSubs[0].createdAt
            )
          : null;

        return {
          studentId: enrollment.student.id,
          fullName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
          email: enrollment.student.email,
          isActive: enrollment.student.isActive,
          isOnlineNow,
          groupId: enrollment.group?.id || null,
          groupName: enrollment.group?.name || null,
          attempts: studentSubs.length,
          bestPercent,
          submissionState,
          hasSubmission,
          lastSubmittedAt,
        };
      });

      const summary = {
        totalStudents: baseRows.length,
        passedCount: baseRows.filter((r) => r.submissionState === "PASSED").length,
        failedCount: baseRows.filter((r) => r.submissionState === "FAILED").length,
        notSubmittedCount: baseRows.filter((r) => r.submissionState === "NOT_SUBMITTED").length,
        onlineNowCount: baseRows.filter((r) => r.isOnlineNow).length,
        averageBestPercent:
          baseRows.filter((r) => r.hasSubmission).length > 0
            ? Math.round(
                baseRows
                  .filter((r) => r.hasSubmission)
                  .reduce((sum, r) => sum + r.bestPercent, 0) /
                  baseRows.filter((r) => r.hasSubmission).length
              )
            : 0,
      };

      const filteredRows =
        selectedSubmissionState === "ALL"
          ? baseRows
          : baseRows.filter((r) => r.submissionState === selectedSubmissionState);

      filteredRows.sort((a, b) => {
        if (a.submissionState === "NOT_SUBMITTED" && b.submissionState !== "NOT_SUBMITTED") return 1;
        if (a.submissionState !== "NOT_SUBMITTED" && b.submissionState === "NOT_SUBMITTED") return -1;
        if (b.bestPercent !== a.bestPercent) return b.bestPercent - a.bestPercent;
        return a.fullName.localeCompare(b.fullName);
      });

      return {
        success: true as const,
        data: {
          courses,
          homeworks,
          groups,
          summary,
          rows: filteredRows,
        },
      };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getUserById ----------
export async function getUserById(id: string) {
  return withAuth(async () => {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) return { success: false, error: "User not found" };

    return { success: true, data: user };
  });
}

// ---------- createUser ----------
export async function createUser(data: {
  email?: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
}) {
  return withAuth(
    async (session) => {
      // Email необязателен (офлайн-студенты без входа по почте).
      // Пустая строка → null, иначе уникальный индекс словит коллизию по "".
      const email = data.email?.trim() ? data.email.trim() : null;

      if (email) {
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          return { success: false, error: "User with this email already exists" };
        }
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: data.role,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "User",
        entityId: user.id,
        action: "CREATE",
        metadata: { email: user.email, role: user.role },
      });

      revalidateLocalized("/users");
      return { success: true, data: user };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- updateUser ----------
export async function updateUser(
  id: string,
  data: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role?: Role;
    isActive?: boolean;
  }
) {
  return withAuth(
    async (session) => {
      const existing = await prisma.user.findUnique({
        where: { id },
        select: { email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true },
      });
      if (!existing) return { success: false, error: "User not found" };

      // Email необязателен: пустую строку сохраняем как null (иначе коллизия
      // уникального индекса по ""). undefined значит «поле не меняем».
      const email =
        data.email !== undefined ? (data.email.trim() || null) : undefined;

      if (email) {
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser && existingUser.id !== id) {
          return { success: false, error: "Email is already in use" };
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(email !== undefined && { email }),
          ...(data.firstName !== undefined && { firstName: data.firstName }),
          ...(data.lastName !== undefined && { lastName: data.lastName }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const changes = computeChanges(existing, data);
      if (changes) {
        await createAuditLog({
          userId: session.user.id,
          entityType: "User",
          entityId: id,
          action: "UPDATE",
          changes,
        });
      }

      revalidateLocalized("/users");
      revalidateLocalized(`/dashboard/users/${id}`);
      return { success: true, data: user };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- deleteUser (soft delete) ----------
export async function deleteUser(id: string) {
  return withAuth(
    async (session) => {
      if (session.user.id === id) {
        return { success: false, error: "Cannot deactivate your own account" };
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "User",
        entityId: id,
        action: "DELETE",
        metadata: { softDelete: true },
      });

      revalidateLocalized("/users");
      return { success: true };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- updateProfile ----------
export async function updateProfile(data: {
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  return withAuth(async (session) => {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
    });

    revalidateLocalized("/profile");
    return { success: true, data: user };
  });
}

// ---------- changePassword ----------
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  return withAuth(async (session) => {
    if (typeof data.newPassword !== "string" || data.newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) return { success: false, error: "User not found" };

    // У Telegram-аккаунтов пароля может не быть — тогда разрешаем задать его сразу
    if (user.passwordHash) {
      const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!isValid) {
        return { success: false, error: "Current password is incorrect" };
      }
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash },
    });

    return { success: true };
  });
}

"use server";

import { prisma } from "@/lib/prisma";
import { botMessages } from "@/lib/telegram/messages";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";
import { revalidateLocalized } from "@/lib/revalidate";
import { sendTelegramMessage } from "@/lib/telegram/notify";

// ---------- getCatalogCourses ----------
// Каталог для студента: опубликованные курсы с самозаписью (FREE/PAID)
// + состояние текущего студента по каждому курсу.
export async function getCatalogCourses() {
  return withAuth(
    async (session) => {
      const courses = await prisma.course.findMany({
        where: {
          isPublished: true,
          isTemplate: false,
          deletedAt: null,
          accessType: { in: ["FREE", "PAID"] },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          coverImage: true,
          accessType: true,
          price: true,
          intakeSeats: true,
          teacher: { select: { firstName: true, lastName: true } },
          _count: { select: { enrollments: true, lessons: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      });

      const [enrollments, requests] = await Promise.all([
        prisma.enrollment.findMany({
          where: { studentId: session.user.id },
          select: { courseId: true },
        }),
        prisma.enrollmentRequest.findMany({
          where: { studentId: session.user.id },
          select: { courseId: true, status: true },
        }),
      ]);

      const enrolledIds = new Set(enrollments.map((e) => e.courseId));
      const requestByCourse = new Map(requests.map((r) => [r.courseId, r.status]));

      const data = courses.map((course) => ({
        ...course,
        isEnrolled: enrolledIds.has(course.id),
        myRequestStatus: requestByCourse.get(course.id) ?? null,
        seatsLeft:
          course.intakeSeats !== null
            ? Math.max(0, course.intakeSeats - course._count.enrollments)
            : null,
      }));

      return { success: true as const, data };
    },
    { roles: ["STUDENT"] }
  );
}

// ---------- enrollInFreeCourse ----------
export async function enrollInFreeCourse(courseId: string) {
  return withAuth(
    async (session) => {
      const studentId = session.user.id;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          slug: true,
          isPublished: true,
          accessType: true,
          intakeSeats: true,
        },
      });

      if (!course || !course.isPublished || course.accessType !== "FREE") {
        return { success: false as const, error: "courseNotAvailable" };
      }

      const existing = await prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId } },
      });
      if (existing) {
        return { success: false as const, error: "alreadyEnrolled" };
      }

      try {
        await prisma.$transaction(async (tx) => {
          if (course.intakeSeats !== null) {
            const taken = await tx.enrollment.count({ where: { courseId } });
            if (taken >= course.intakeSeats) {
              throw new Error("NO_SEATS_LEFT");
            }
          }
          await tx.enrollment.create({ data: { studentId, courseId } });
        });
      } catch (error) {
        if (error instanceof Error && error.message === "NO_SEATS_LEFT") {
          return { success: false as const, error: "noSeatsLeft" };
        }
        // Гонка на unique(studentId, courseId)
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          return { success: false as const, error: "alreadyEnrolled" };
        }
        throw error;
      }

      await createAuditLog({
        userId: studentId,
        entityType: "Enrollment",
        entityId: `${studentId}:${courseId}`,
        action: "CREATE",
        metadata: { courseId, studentId, selfEnrolled: true },
      });

      revalidateLocalized("/courses");
      revalidateLocalized("/courses/browse");
      return { success: true as const, data: { courseSlug: course.slug } };
    },
    { roles: ["STUDENT"] }
  );
}

// ---------- requestEnrollment ----------
export async function requestEnrollment(courseId: string) {
  return withAuth(
    async (session) => {
      const studentId = session.user.id;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          isPublished: true,
          accessType: true,
          teacher: {
            select: { telegramChatId: true },
          },
        },
      });

      if (!course || !course.isPublished || course.accessType !== "PAID") {
        return { success: false as const, error: "courseNotAvailable" };
      }

      const enrolled = await prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId } },
      });
      if (enrolled) {
        return { success: false as const, error: "alreadyEnrolled" };
      }

      const existing = await prisma.enrollmentRequest.findUnique({
        where: { courseId_studentId: { courseId, studentId } },
      });
      if (existing && existing.status === "PENDING") {
        return { success: false as const, error: "alreadyRequested" };
      }
      if (existing && existing.status === "APPROVED") {
        return { success: false as const, error: "alreadyEnrolled" };
      }

      const request = await prisma.enrollmentRequest.upsert({
        where: { courseId_studentId: { courseId, studentId } },
        create: { courseId, studentId },
        update: { status: "PENDING", reviewedById: null, reviewedAt: null },
      });

      await createAuditLog({
        userId: studentId,
        entityType: "EnrollmentRequest",
        entityId: request.id,
        action: existing ? "UPDATE" : "CREATE",
        metadata: { courseId, studentId, resubmitted: !!existing },
      });

      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { firstName: true, lastName: true, phone: true },
      });
      await sendTelegramMessage(
        course.teacher.telegramChatId,
        botMessages.newEnrollmentRequest(
          course.title,
          `${student?.firstName ?? ""} ${student?.lastName ?? ""}`.trim(),
          student?.phone
        )
      );

      revalidateLocalized("/courses/browse");
      revalidateLocalized("/courses/requests");
      return { success: true as const };
    },
    { roles: ["STUDENT"] }
  );
}

// ---------- getEnrollmentRequests ----------
export async function getEnrollmentRequests() {
  return withAuth(
    async (session) => {
      const where =
        session.user.role === "TEACHER"
          ? { course: { teacherId: session.user.id } }
          : {};

      const requests = await prisma.enrollmentRequest.findMany({
        where,
        include: {
          course: { select: { id: true, title: true, slug: true, price: true } },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              telegramUsername: true,
            },
          },
          reviewedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // PENDING всегда сверху, затем решённые по дате
      const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 } as const;
      requests.sort(
        (a, b) =>
          order[a.status] - order[b.status] ||
          b.createdAt.getTime() - a.createdAt.getTime()
      );

      return { success: true as const, data: requests };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getEnrollmentRequestsCount ----------
export async function getEnrollmentRequestsCount() {
  return withAuth(
    async (session) => {
      const where =
        session.user.role === "TEACHER"
          ? { status: "PENDING" as const, course: { teacherId: session.user.id } }
          : { status: "PENDING" as const };

      const count = await prisma.enrollmentRequest.count({ where });
      return { success: true as const, data: { count } };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- shared: загрузка заявки с проверкой прав ----------
async function findRequestForReview(requestId: string, session: { user: { id: string; role: string } }) {
  const request = await prisma.enrollmentRequest.findUnique({
    where: { id: requestId },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          teacherId: true,
          intakeSeats: true,
        },
      },
      student: { select: { id: true, telegramChatId: true } },
    },
  });

  if (!request) return { ok: false as const, error: "requestNotFound" };
  if (
    session.user.role === "TEACHER" &&
    request.course.teacherId !== session.user.id
  ) {
    return { ok: false as const, error: "forbidden" };
  }
  if (request.status !== "PENDING") {
    return { ok: false as const, error: "alreadyReviewed" };
  }
  return { ok: true as const, request };
}

// ---------- approveEnrollmentRequest ----------
export async function approveEnrollmentRequest(requestId: string) {
  return withAuth(
    async (session) => {
      const found = await findRequestForReview(requestId, session);
      if (!found.ok) return { success: false as const, error: found.error };
      const { request } = found;

      try {
        await prisma.$transaction(async (tx) => {
          if (request.course.intakeSeats !== null) {
            const taken = await tx.enrollment.count({
              where: { courseId: request.courseId },
            });
            if (taken >= request.course.intakeSeats) {
              throw new Error("NO_SEATS_LEFT");
            }
          }
          await tx.enrollment.create({
            data: { studentId: request.studentId, courseId: request.courseId },
          });
          await tx.enrollmentRequest.update({
            where: { id: request.id },
            data: {
              status: "APPROVED",
              reviewedById: session.user.id,
              reviewedAt: new Date(),
            },
          });
        });
      } catch (error) {
        if (error instanceof Error && error.message === "NO_SEATS_LEFT") {
          return { success: false as const, error: "noSeatsLeft" };
        }
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          return { success: false as const, error: "alreadyEnrolled" };
        }
        throw error;
      }

      await createAuditLog({
        userId: session.user.id,
        entityType: "EnrollmentRequest",
        entityId: request.id,
        action: "UPDATE",
        changes: { status: { old: "PENDING", new: "APPROVED" } },
        metadata: { courseId: request.courseId, studentId: request.studentId },
      });

      await sendTelegramMessage(
        request.student.telegramChatId,
        botMessages.enrollmentApproved(request.course.title)
      );

      revalidateLocalized("/courses/requests");
      revalidateLocalized("/courses/browse");
      return { success: true as const };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- rejectEnrollmentRequest ----------
export async function rejectEnrollmentRequest(requestId: string) {
  return withAuth(
    async (session) => {
      const found = await findRequestForReview(requestId, session);
      if (!found.ok) return { success: false as const, error: found.error };
      const { request } = found;

      await prisma.enrollmentRequest.update({
        where: { id: request.id },
        data: {
          status: "REJECTED",
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "EnrollmentRequest",
        entityId: request.id,
        action: "UPDATE",
        changes: { status: { old: "PENDING", new: "REJECTED" } },
        metadata: { courseId: request.courseId, studentId: request.studentId },
      });

      await sendTelegramMessage(
        request.student.telegramChatId,
        botMessages.enrollmentRejected(request.course.title)
      );

      revalidateLocalized("/courses/requests");
      revalidateLocalized("/courses/browse");
      return { success: true as const };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

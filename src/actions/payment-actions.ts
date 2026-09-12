"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";
import { revalidateLocalized } from "@/lib/revalidate";
import {
  createPaymentSchema,
  paymentFiltersSchema,
  type CreatePaymentInput,
  type PaymentFilters,
} from "@/validators/payment";
import { toNoonUtc } from "@/lib/date-only";

/** Границы календарного месяца "YYYY-MM" в UTC: [начало, начало следующего) */
function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
    lt: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

// ---------- getPayments (ADMIN) ----------
// Журнал оплат с фильтрами. month фильтрует по дате приёма денег (касса за месяц),
// а не по периоду forMonth.
export async function getPayments(filters: PaymentFilters = {}) {
  return withAuth(
    async () => {
      // Мусор в фильтрах не ошибка: показываем журнал целиком
      const parsed = paymentFiltersSchema.safeParse(filters);
      const { month, courseId, groupId, studentId, method } = parsed.success
        ? parsed.data
        : {};

      const where = {
        deletedAt: null,
        ...(month ? { paidAt: monthRange(month) } : {}),
        ...(courseId ? { courseId } : {}),
        ...(groupId ? { groupId } : {}),
        ...(studentId ? { studentId } : {}),
        ...(method ? { method } : {}),
      };

      const [payments, totals] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, phone: true },
            },
            course: { select: { id: true, title: true } },
            group: { select: { id: true, name: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          take: 500,
        }),
        prisma.payment.aggregate({
          where,
          _sum: { amount: true },
          _count: true,
        }),
      ]);

      return {
        success: true as const,
        data: {
          payments,
          total: totals._sum.amount ?? 0,
          count: totals._count,
        },
      };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getPaymentFormOptions (ADMIN) ----------
// Студенты с их записями на курсы: выбор студента в форме сразу подставляет
// доступные курсы, группу и цену, без второго round-trip.
export async function getPaymentFormOptions() {
  return withAuth(
    async () => {
      const students = await prisma.user.findMany({
        where: {
          role: "STUDENT",
          deletedAt: null,
          enrollments: { some: {} },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          enrollments: {
            where: { course: { deletedAt: null } },
            select: {
              courseId: true,
              course: { select: { title: true, price: true } },
              groupId: true,
              group: { select: { name: true } },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });

      const courses = await prisma.course.findMany({
        where: { deletedAt: null, enrollments: { some: {} } },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      });

      return {
        success: true as const,
        data: {
          students: students.map((student) => ({
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            phone: student.phone,
            enrollments: student.enrollments.map((enrollment) => ({
              courseId: enrollment.courseId,
              courseTitle: enrollment.course.title,
              price: enrollment.course.price,
              groupId: enrollment.groupId,
              groupName: enrollment.group?.name ?? null,
            })),
          })),
          courses,
        },
      };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- createPayment (ADMIN) ----------
export async function createPayment(input: CreatePaymentInput) {
  return withAuth(
    async (session) => {
      const parsed = createPaymentSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false as const, error: "invalidInput" };
      }
      const { studentId, courseId, groupId, amount, method, paidAt, forMonth, comment } =
        parsed.data;

      // Оплату принимаем только по существующей записи на курс — иначе платёж
      // повиснет вне группы и не попадёт в расчёт задолженности.
      const enrollment = await prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId } },
        select: { groupId: true },
      });
      if (!enrollment) {
        return { success: false as const, error: "notEnrolled" };
      }

      const payment = await prisma.payment.create({
        data: {
          studentId,
          courseId,
          // Группу берём из записи студента: в форме она справочная
          groupId: groupId || enrollment.groupId,
          amount,
          method,
          paidAt: toNoonUtc(paidAt),
          forMonth,
          comment: comment?.trim() || null,
          createdById: session.user.id,
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Payment",
        entityId: payment.id,
        action: "CREATE",
        metadata: { studentId, courseId, amount, method, forMonth: forMonth ?? null },
      });

      revalidateLocalized("/payments");
      return { success: true as const, data: { id: payment.id } };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- deletePayment (ADMIN) ----------
// Мягкое удаление: журнал кассы не переписываем, ошибочную запись скрываем.
export async function deletePayment(id: string) {
  return withAuth(
    async (session) => {
      const payment = await prisma.payment.findUnique({
        where: { id },
        select: { id: true, deletedAt: true, amount: true, studentId: true, courseId: true },
      });
      if (!payment || payment.deletedAt) {
        return { success: false as const, error: "paymentNotFound" };
      }

      await prisma.payment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Payment",
        entityId: id,
        action: "DELETE",
        metadata: {
          studentId: payment.studentId,
          courseId: payment.courseId,
          amount: payment.amount,
        },
      });

      revalidateLocalized("/payments");
      return { success: true as const };
    },
    { roles: ["ADMIN"] }
  );
}

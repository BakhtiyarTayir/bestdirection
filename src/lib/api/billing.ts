import { apiFetch } from "./client";

// Модуль billing в api: начисления, должники, оплаты. Типы ответов пишутся
// руками, пока api не публикует OpenAPI. Серверные компоненты берут те же
// маршруты из ./billing.server.

export type PaymentMethodValue = "CASH" | "CARD" | "PAYME" | "CLICK" | "TRANSFER";

export interface ApiBillingRow {
  enrollmentId: string;
  student: { id: string; firstName: string; lastName: string; phone: string | null; telegramUsername: string | null };
  course: { id: string; title: string };
  group: { id: string; name: string } | null;
  monthlyPrice: number;
  hasSchedule: boolean;
  hasGroup: boolean;
  charged: number;
  paid: number;
  debt: number;
  billedMonths: number;
  breakdown: { month: string; amount: number; basis: string; unitsTotal: number; unitsBilled: number }[];
}

export interface ApiDebtors {
  month: string;
  debtors: ApiBillingRow[];
  totalDebt: number;
  prepaidCount: number;
  prepaidTotal: number;
  withoutGroup: number;
  groupWithoutSchedule: number;
}

export interface ApiEnrollmentBilling {
  id: string;
  studentName: string;
  courseTitle: string;
  groupName: string | null;
  coursePrice: number | null;
  groupPrice: number | null;
  startsAt: string;
  startsAtExplicit: boolean;
  effectiveStartsAt: string;
  billingEndsAt: string | null;
  priceOverride: number | null;
  firstMonthCharge: number | null;
  firstMonth: string;
  suggestedFirstMonthCharge: number;
  suggestionBasis: string;
  suggestionUnitsTotal: number;
  suggestionUnitsBilled: number;
  hasSchedule: boolean;
}

export interface ApiStudentBilling {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    telegramUsername: string | null;
  };
  upToMonth: string;
  courses: {
    enrollmentId: string;
    course: { id: string; title: string };
    group: { id: string; name: string } | null;
    monthlyPrice: number;
    hasSchedule: boolean;
    startsAt: string;
    billingEndsAt: string | null;
    totalCharged: number;
    totalPaid: number;
    balance: number;
    months: {
      month: string;
      charged: number;
      paid: number;
      basis: string;
      unitsTotal: number;
      unitsBilled: number;
      balance: number;
      locked: boolean;
    }[];
  }[];
  payments: {
    id: string;
    amount: number;
    method: PaymentMethodValue;
    paidAt: string;
    forMonth: string | null;
    comment: string | null;
    courseTitle: string;
    groupName: string | null;
    createdBy: string;
  }[];
  totals: { charged: number; paid: number; balance: number };
}

export interface ApiStudentsOverview {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  courses: { enrollmentId: string; title: string; groupName: string | null }[];
  balance: number;
}

export interface ApiPaymentsPage {
  payments: {
    id: string;
    amount: number;
    method: PaymentMethodValue;
    paidAt: string;
    forMonth: string | null;
    comment: string | null;
    student: { id: string; firstName: string; lastName: string; phone: string | null };
    course: { id: string; title: string };
    group: { id: string; name: string } | null;
    createdBy: { firstName: string; lastName: string };
  }[];
  total: number;
  count: number;
}

export interface ApiPaymentFormOptions {
  students: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    enrollments: {
      courseId: string;
      courseTitle: string;
      price: number | null;
      groupId: string | null;
      groupName: string | null;
    }[];
  }[];
  courses: { id: string; title: string }[];
}

export interface ApiRecalcPreview {
  month: string;
  priceUsed: number;
  current: { amount: number; basis: string; unitsTotal: number; unitsBilled: number };
  next: { amount: number; basis: string; unitsTotal: number; unitsBilled: number };
  changed: boolean;
}

// ---------- браузер ----------

export const getEnrollmentBilling = (enrollmentId: string) =>
  apiFetch<ApiEnrollmentBilling | null>(`/billing/enrollments/${enrollmentId}`);

export const updateEnrollmentBilling = (
  enrollmentId: string,
  body: { startsAt?: string; billingEndsAt?: string; priceOverride?: number; firstMonthCharge?: number }
) => apiFetch<{ ok: true }>(`/billing/enrollments/${enrollmentId}`, { method: "PATCH", body });

export const previewMonthRecalc = (enrollmentId: string, month: string) =>
  apiFetch<ApiRecalcPreview>(`/billing/enrollments/${enrollmentId}/recalc`, { query: { month } });

export const recalculateMonth = (enrollmentId: string, month: string) =>
  apiFetch<{ amount: number; changed: boolean }>(`/billing/enrollments/${enrollmentId}/recalc`, {
    method: "POST",
    query: { month },
  });

export const createPayment = (body: {
  studentId: string;
  courseId: string;
  groupId?: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  forMonth?: string;
  comment?: string;
}) => apiFetch<{ id: string }>("/billing/payments", { method: "POST", body });

export const deletePayment = (id: string) =>
  apiFetch<{ ok: true }>(`/billing/payments/${id}`, { method: "DELETE" });

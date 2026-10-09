import type { PaymentMethodValue } from "./billing";
import { apiFetch } from "./client";

// Модуль salary в api: начисления, зарплата и журнал выплат преподавателям.
// Типы ответов пишутся руками, пока api не публикует OpenAPI — тот же приём,
// что у ./billing. Серверные компоненты берут те же маршруты из ./salary.server.

export interface ApiSalaryOverviewRow {
  teacherId: string;
  teacherName: string;
  groupsCount: number;
  unratedGroupsCount: number;
  // Групп, где сумма месяца посчитана запасным путём — нет расписания или
  // ни одной отметки в журнале за месяц (этап 2 плана «Уроки и карточка группы»)
  fallbackGroupsCount: number;
  studentsCount: number;
  base: number;
  accrued: number;
  accruedTotal: number;
  paidTotal: number;
  debt: number;
}

export interface ApiSalaryOverview {
  month: string;
  rows: ApiSalaryOverviewRow[];
  // base/studentsCount/groupsCount считаются без повторов по группе за
  // месяц: у группы с заменой несколько строк в rows (владелец и
  // заменяющие), но это одна и та же группа — в totals она учтена один раз
  totals: { base: number; studentsCount: number; groupsCount: number; accrued: number; paid: number; debt: number };
}

export interface ApiSalaryMonthSession {
  date: string;
  /** Занятие сверх плана месяца — отработка (план, 4.4) */
  isMakeup: boolean;
}

export interface ApiSalaryMonth {
  id: string | null;
  month: string;
  base: number;
  studentsCount: number;
  percentUsed: number | null;
  amount: number;
  isFormula: boolean;
  locked: boolean;
  // Раскладка по занятиям (этап 3). null — раскладки не было (запасной путь
  // или курс без группы)
  lessonsPlanned: number | null;
  lessonsTaught: number | null;
  // Сколько занятий вообще отмечено в журнале группы за месяц, независимо
  // от того, кто их вёл. null — раскладка неприменима (курс без группы)
  sessionsMarked: number | null;
  lessonsScheduled: number | null;
  // Раскладка недоступна: нет расписания или ни одной отметки за месяц —
  // вся сумма целиком педагогу группы (этап 2, «прямая пометка почему»)
  fallback: boolean;
  // Занятия этого преподавателя за месяц с датами — отработки помечены
  sessions: ApiSalaryMonthSession[];
}

export interface ApiSalaryGroup {
  groupId: string | null;
  groupName: string | null;
  courseId: string;
  courseTitle: string;
  branchId: string | null;
  groupPercentBp: number | null;
  months: ApiSalaryMonth[];
}

export interface ApiSalaryPayout {
  id: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  forMonth: string | null;
  comment: string | null;
  createdBy: string;
}

export interface ApiTeacherSalary {
  teacher: { id: string; firstName: string; lastName: string; salaryPercentBp: number | null };
  month: string;
  groups: ApiSalaryGroup[];
  accruedTotal: number;
  paidTotal: number;
  debt: number;
  payouts: ApiSalaryPayout[];
}

export interface ApiSalaryGroupStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  unenrolled: boolean;
  charged: number;
  paid: number;
  // charged - paid; отрицательное — переплата за месяц
  remaining: number;
}

export interface ApiSalaryGroupStudents {
  month: string;
  locked: boolean;
  // База из строки зарплаты закрытого месяца; null у открытого
  frozenBase: number | null;
  totals: { charged: number; paid: number; remaining: number };
  students: ApiSalaryGroupStudent[];
}

export interface ApiPayoutsPage {
  payouts: {
    id: string;
    amount: number;
    method: PaymentMethodValue;
    paidAt: string;
    forMonth: string | null;
    comment: string | null;
    teacher: { id: string; firstName: string; lastName: string };
    createdBy: { firstName: string; lastName: string };
  }[];
  total: number;
  count: number;
}

// ---------- браузер ----------

export const setManualSalaryAmount = (accrualId: string, manualAmount: number | null) =>
  apiFetch<{ amount: number }>(`/salary/accruals/${accrualId}`, { method: "PATCH", body: { manualAmount } });

export const recalculateSalaryMonth = (teacherId: string, month: string, groupId: string | null, courseId: string) =>
  apiFetch<{ amount: number; changed: boolean }>(`/salary/${teacherId}/recalc`, {
    method: "POST",
    // courseId нужен для записей без группы: курсов у педагога может быть несколько
    query: { month, groupId: groupId ?? undefined, courseId },
  });

export const createPayout = (body: {
  teacherId: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  forMonth?: string;
  comment?: string;
}) => apiFetch<{ id: string }>("/salary/payouts", { method: "POST", body });

export const deletePayout = (id: string) => apiFetch<{ ok: true }>(`/salary/payouts/${id}`, { method: "DELETE" });

export const getSalaryGroupStudents = (month: string, groupId: string | null, courseId: string) =>
  apiFetch<ApiSalaryGroupStudents>("/salary/group-students", {
    // Курс без группы: groupId не передаётся, единицу определяет курс
    query: groupId ? { month, groupId } : { month, courseId },
  });

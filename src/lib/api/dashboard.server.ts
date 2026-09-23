import "server-only";
import type { ApiAdminDashboard, ApiDashboardSummary } from "./dashboard";
import { apiServerFetch } from "./server";

// Сводка на главной кабинета: состав зависит от роли вызывающего.

export const getDashboardSummary = () =>
  apiServerFetch<ApiDashboardSummary>("/dashboard/summary");

/** Главная панель администратора (план дашборда, раздел 1). */
export const getAdminDashboard = (branchId?: string) =>
  apiServerFetch<ApiAdminDashboard>("/dashboard/admin", { query: { branchId } });

// Панель преподавателя (план дашборда, раздел 2): расписание моих групп на
// сегодня/неделю/месяц одним запросом (вкладки фильтруют на клиенте), список
// неотмеченных занятий за месяц и своя зарплата — числа считает api,
// интерфейс только раскладывает их по карточкам.

export interface ApiTeacherScheduleLesson {
  groupId: string;
  groupName: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  branchId: string;
  branchName: string;
  schedule: string | null;
  /** true/false — занятие сегодня или в прошлом; null — в будущем, отмечать ещё нечего */
  marked: boolean | null;
  /** Отметка в журнале на день вне расписания группы */
  isMakeup: boolean;
}

export interface ApiTeacherScheduleDay {
  date: string; // YYYY-MM-DD
  /** ISO: 1 = понедельник … 7 = воскресенье */
  weekday: number;
  lessons: ApiTeacherScheduleLesson[];
}

export interface ApiTeacherUnmarkedGroup {
  groupId: string;
  groupName: string;
  courseTitle: string;
  courseSlug: string;
  /** DD.MM */
  dates: string[];
}

export interface ApiTeacherDashboard {
  today: { date: string; markedCount: number; totalCount: number };
  unmarkedThisMonth: ApiTeacherUnmarkedGroup[];
  schedule: {
    weekStart: string;
    weekEnd: string;
    month: string;
    days: ApiTeacherScheduleDay[];
  };
  salary: { month: string; accruedThisMonth: number; paidTotal: number; debt: number };
  courses: number;
  students: number;
}

export const getTeacherDashboard = () => apiServerFetch<ApiTeacherDashboard>("/dashboard/teacher");

// Дашборд ученика и родителя (раздел 3 плана главной панели). Баланс —
// урезанная витрина BillingService.studentBilling: итог и по курсам, без
// истории платежей и имён сотрудников, которые студенту видеть незачем.

export interface ApiStudentBillingCourse {
  courseId: string;
  courseTitle: string;
  groupName: string | null;
  monthlyPrice: number;
  /** Плюс — аванс, минус — долг, как на карточке студента у администратора */
  balance: number;
}

export interface ApiStudentBilling {
  balance: number;
  prepaidFuture: number;
  courses: ApiStudentBillingCourse[];
}

export interface ApiNextLesson {
  groupId: string;
  groupName: string;
  courseTitle: string;
  /** "YYYY-MM-DD" */
  date: string;
  schedule: string | null;
}

export interface ApiHomeworkDue {
  id: string;
  slug: string;
  title: string;
  courseSlug: string;
  courseTitle: string;
  lessonSlug: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
}

export interface ApiStudentDashboardBlock {
  billing: ApiStudentBilling;
  nextLessons: ApiNextLesson[];
  homeworks: ApiHomeworkDue[];
}

export type ApiStudentDashboard =
  | ({ role: "STUDENT" } & ApiStudentDashboardBlock)
  | {
      role: "PARENT";
      children: ({ studentId: string; firstName: string; lastName: string } & ApiStudentDashboardBlock)[];
    };

export const getStudentDashboard = () =>
  apiServerFetch<ApiStudentDashboard>("/dashboard/student");

/** slug-адрес → идентификаторы. Недоступное api отдаёт как несуществующее. */
export const resolvePath = (params: {
  courseSlug: string;
  lessonSlug?: string;
  homeworkSlug?: string;
}) =>
  apiServerFetch<{ courseId: string; lessonId?: string; homeworkId?: string }>("/paths/resolve", {
    query: params,
  });

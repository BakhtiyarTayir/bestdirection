import "server-only";
import { apiServerFetch } from "./server";

// Сводка на главной кабинета: состав зависит от роли вызывающего.

export type ApiDashboardSummary =
  | { role: "ADMIN"; users: number; courses: number; students: number; teachers: number }
  | { role: "TEACHER"; courses: number; students: number }
  | { role: "STUDENT"; courses: number; tests: number };

export const getDashboardSummary = () =>
  apiServerFetch<ApiDashboardSummary>("/dashboard/summary");

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

/** slug-адрес → идентификаторы. Недоступное api отдаёт как несуществующее. */
export const resolvePath = (params: {
  courseSlug: string;
  lessonSlug?: string;
  homeworkSlug?: string;
}) =>
  apiServerFetch<{ courseId: string; lessonId?: string; homeworkId?: string }>("/paths/resolve", {
    query: params,
  });

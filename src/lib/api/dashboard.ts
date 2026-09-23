// Дашборд: сводка на главной кабинета (GET /dashboard/summary) и главная
// панель администратора (GET /dashboard/admin, план дашборда, раздел 1).
// Типы ответов api пишутся руками, как у ./billing и ./finance.

export type ApiDashboardSummary =
  | { role: "ADMIN"; users: number; courses: number; students: number; teachers: number }
  | { role: "TEACHER"; courses: number; students: number }
  | { role: "STUDENT"; courses: number; tests: number };

export interface ApiAdminDashboardMoney {
  /** Принято оплат за месяц */
  received: number;
  /** ±% к прошлому месяцу; null — сравнивать не с чем (нет данных или прошлый месяц нулевой) */
  receivedChangePercent: number | null;
  debtTotal: number;
  debtorsCount: number;
  /** Долг центра перед преподавателями */
  teacherDebt: number;
  cashProfit: number;
}

export interface ApiAdminDashboardLesson {
  groupId: string;
  groupName: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  branchId: string;
  branchName: string;
  teacherName: string;
  schedule: string | null;
  /** Есть ли AttendanceSession на сегодня у этой группы */
  marked: boolean;
}

export interface ApiAdminDashboardToday {
  markedCount: number;
  totalCount: number;
  lessons: ApiAdminDashboardLesson[];
}

export interface ApiAdminDashboardAttention {
  pendingRequests: number;
  uncontactedLeads: number;
  studentsWithoutGroup: number;
  groupsWithoutRate: number;
  groupsWithIncompleteJournal: number;
}

export interface ApiAdminDashboard {
  month: string;
  date: string;
  money: ApiAdminDashboardMoney;
  today: ApiAdminDashboardToday;
  attention: ApiAdminDashboardAttention;
}

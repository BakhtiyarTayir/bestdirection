import "server-only";
import { apiServerFetch } from "./server";
import type {
  ApiAuditLogPage,
  ApiDeactivatedUser,
  ApiHomeworkStatistics,
  ApiTeacher,
  ApiUser,
  ApiUsersFormOptions,
  HomeworkSubmissionState,
} from "./users";

// Те же маршруты модуля users, но для серверных компонентов: запрос идёт по
// внутренней сети с пробросом куки. Отдельный модуль, потому что ./server
// импортирует next/headers — в браузерный бандл он попасть не должен.

export const getUsers = (branchId?: string) => apiServerFetch<ApiUser[]>("/users", { query: { branchId } });
export const getDeactivatedUsers = () => apiServerFetch<ApiDeactivatedUser[]>("/users/deactivated");
export const getNewUsersCount = () => apiServerFetch<{ count: number }>("/users/new/count");
export const getTeachers = () => apiServerFetch<ApiTeacher[]>("/users/teachers");
export const getUserById = (id: string) => apiServerFetch<ApiUser>(`/users/${id}`);

/** Курсы и группы для блока «Обучение» в форме создания ученика (4.4). */
export const getUsersFormOptions = () => apiServerFetch<ApiUsersFormOptions>("/users/form-options");

export const getUsersHomeworkStatistics = (query: {
  courseId?: string;
  homeworkId?: string;
  groupId?: string;
  submissionState?: HomeworkSubmissionState;
  locale?: string;
}) => apiServerFetch<ApiHomeworkStatistics>("/users/statistics/homework", { query });

export const getAuditLog = (query: { entityType?: string; action?: string; page?: number }) =>
  apiServerFetch<ApiAuditLogPage>("/audit-log", { query });

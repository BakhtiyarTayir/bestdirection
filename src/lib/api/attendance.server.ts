import "server-only";
import type {
  ApiAttendanceGroup,
  ApiAttendanceReport,
  ApiAttendanceSession,
  ApiChildLink,
  ApiParentLink,
  ApiStudentAttendance,
  ApiTeacherAttendanceRow,
  ApiTeacherSession,
} from "./attendance";
import { apiServerFetch } from "./server";

// Те же маршруты посещаемости и родителей для серверных компонентов.

export const getAttendanceSessions = (courseId: string, groupId?: string) =>
  apiServerFetch<ApiAttendanceSession[]>("/attendance/sessions", { query: { courseId, groupId } });

export const getAttendanceReport = (courseId: string, groupId?: string) =>
  apiServerFetch<ApiAttendanceReport>("/attendance/report", { query: { courseId, groupId } });

/** Список групп раздела «Посещаемость» (план, п.1); groupId — сводка одной группы. */
export const getAttendanceGroups = (query: {
  branchId?: string;
  teacherId?: string;
  month?: string;
  groupId?: string;
}) => apiServerFetch<ApiAttendanceGroup[]>("/attendance/groups", { query });

export const getStudentAttendance = (studentId?: string) =>
  apiServerFetch<ApiStudentAttendance[]>("/attendance/student", { query: { studentId } });

export const getTeacherAttendanceReport = (query: {
  from?: string;
  to?: string;
  teacherId?: string;
  locale?: string;
}) => apiServerFetch<ApiTeacherAttendanceRow[]>("/attendance/teachers/report", { query });

export const getTeacherSessions = (query: { from?: string; to?: string; teacherId?: string }) =>
  apiServerFetch<ApiTeacherSession[]>("/attendance/teachers/sessions", { query });

export const getStudentParents = (studentId: string) =>
  apiServerFetch<ApiParentLink[]>("/parents/by-student", { query: { studentId } });

export const getParentChildren = (parentId?: string) =>
  apiServerFetch<ApiChildLink[]>("/parents/children", { query: { parentId } });

/** Получатели рассылки по группе: нужны рассылкам, которые пока живут в web. */
export const getGroupRecipients = (groupId: string) =>
  apiServerFetch<{
    recipients: {
      parent: { id: string; firstName: string; lastName: string; phone: string | null; isActive: boolean };
      relation: string;
      isPrimary: boolean;
      children: { id: string; firstName: string; lastName: string }[];
    }[];
    withoutPhone: {
      parent: { id: string; firstName: string; lastName: string; phone: string | null };
      children: { id: string; firstName: string; lastName: string }[];
    }[];
    studentCount: number;
  }>("/parents/group-recipients", { query: { groupId } });

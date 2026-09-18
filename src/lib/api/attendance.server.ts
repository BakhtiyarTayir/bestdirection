import "server-only";
import type {
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

export const getAttendanceSessions = (courseId: string) =>
  apiServerFetch<ApiAttendanceSession[]>("/attendance/sessions", { query: { courseId } });

export const getAttendanceReport = (courseId: string) =>
  apiServerFetch<ApiAttendanceReport>("/attendance/report", { query: { courseId } });

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
      parent: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null; isActive: boolean };
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

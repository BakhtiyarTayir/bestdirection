import { apiFetch } from "./client";

// Модули attendance и parents в api. Серверные компоненты берут те же маршруты
// из ./attendance.server.

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface ApiAttendanceRecord {
  id: string;
  status: AttendanceStatus;
  note: string | null;
  sessionId: string;
  studentId: string;
  student: { id: string; firstName: string; lastName: string };
}

export interface ApiAttendanceSession {
  id: string;
  date: string;
  note: string | null;
  teacherId: string | null;
  teacherStatus: AttendanceStatus | null;
  teacherNote: string | null;
  startedAt: string | null;
  endedAt: string | null;
  courseId: string;
  groupId: string | null;
  group: { id: string; name: string } | null;
  teacher: { id: string; firstName: string; lastName: string } | null;
  records: ApiAttendanceRecord[];
  _count: { records: number };
}

export interface ApiAttendanceReport {
  sessions: { id: string; date: string; note: string | null }[];
  students: {
    student: { id: string; firstName: string; lastName: string };
    attendance: Record<string, { status: AttendanceStatus; note?: string | null }>;
  }[];
}

export interface ApiStudentAttendance {
  course: { id: string; title: string };
  records: { sessionId: string; date: string; status: AttendanceStatus; note: string | null }[];
}

export interface ApiTeacherAttendanceRow {
  teacherId: string;
  firstName: string;
  lastName: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
}

export interface ApiTeacherSession {
  id: string;
  date: string;
  courseTitle: string;
  courseSlug: string;
  groupName: string | null;
  teacherId: string;
  teacherName: string;
  status: AttendanceStatus | null;
  note: string | null;
  teacherImplicit: boolean;
}

export interface ApiParentLink {
  id: string;
  relation: "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER";
  isPrimary: boolean;
  createdAt?: string;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    isActive: boolean;
    // Сам chat id api не отдаёт — только признак привязки (план приглашений в Telegram)
    hasTelegram: boolean;
  };
}

export interface ApiParentCandidate {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  _count: { childLinks: number };
}

export interface ApiChildLink {
  id: string;
  relation: "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER";
  isPrimary: boolean;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    enrollments: {
      course: { id: string; title: string; slug: string };
      group: { id: string; name: string; schedule: string | null } | null;
    }[];
  };
}

// ---------- браузер ----------

export const getAttendanceSessions = (courseId: string) =>
  apiFetch<ApiAttendanceSession[]>("/attendance/sessions", { query: { courseId } });

export const createAttendanceSession = (body: {
  courseId: string;
  date: string;
  note?: string;
  groupId?: string;
}) => apiFetch<ApiAttendanceSession>("/attendance/sessions", { method: "POST", body });

export const updateAttendanceRecords = (
  sessionId: string,
  body: {
    records: { studentId: string; status: AttendanceStatus; note?: string }[];
    teacher?: {
      teacherId?: string | null;
      status?: AttendanceStatus | null;
      note?: string | null;
      startedAt?: string | null;
      endedAt?: string | null;
    };
  }
) => apiFetch<{ ok: true }>(`/attendance/sessions/${sessionId}/records`, { method: "PATCH", body });

export const deleteAttendanceSession = (sessionId: string) =>
  apiFetch<{ ok: true }>(`/attendance/sessions/${sessionId}`, { method: "DELETE" });

export const setTeacherAttendance = (
  sessionId: string,
  body: { status?: AttendanceStatus | null; note?: string | null }
) => apiFetch<{ ok: true }>(`/attendance/sessions/${sessionId}/teacher`, { method: "POST", body });

export const getStudentParents = (studentId: string) =>
  apiFetch<ApiParentLink[]>("/parents/by-student", { query: { studentId } });

export const searchParentCandidates = (query: string) =>
  apiFetch<ApiParentCandidate[]>("/parents/candidates", { query: { query } });

export const linkParent = (body: {
  parentId: string;
  studentId: string;
  relation?: string;
  isPrimary?: boolean;
}) => apiFetch<{ id: string }>("/parents/links", { method: "POST", body });

export const createParentForStudent = (body: {
  studentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  relation?: string;
  isPrimary?: boolean;
}) => apiFetch<ApiParentLink["parent"]>("/parents", { method: "POST", body });

export const updateParentLink = (id: string, body: { relation?: string; isPrimary?: boolean }) =>
  apiFetch<{ id: string }>(`/parents/links/${id}`, { method: "PATCH", body });

export const unlinkParent = (id: string) =>
  apiFetch<{ id: string }>(`/parents/links/${id}`, { method: "DELETE" });

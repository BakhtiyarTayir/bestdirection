import { apiFetch } from "./client";

// Модуль groups в api. Серверные компоненты берут те же маршруты из
// ./groups.server.

export interface ApiGroup {
  id: string;
  name: string;
  description: string | null;
  schedule: string | null;
  scheduleDays: number[];
  startDate: string | null;
  endDate: string | null;
  price: number | null;
  isActive: boolean;
  sortOrder: number;
  courseId: string;
  branchId: string;
  teacherId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { enrollments: number };
  // В общем списке групп курс приходит всегда, в списке по курсу — нет
  course?: { id: string; slug: string; title: string };
  branch?: { id: string; name: string } | null;
}

export interface ApiGroupStudent {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

/** Общий список групп: курс приходит всегда. */
export interface ApiGroupWithCourse extends ApiGroup {
  course: { id: string; slug: string; title: string };
}

export interface ApiGroupDetails extends ApiGroup {
  course: { id: string; slug: string; title: string; teacherId?: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
  enrollments: { id: string; student: ApiGroupStudent }[];
  _count: { enrollments: number };
}

export interface ApiGroupCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  enrolled: boolean;
  currentGroup: string | null;
}

export interface ApiTeacherOption {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ApiGroupStatistics {
  group: { id: string; name: string; course: { id: string; title: string; slug: string } };
  summary: {
    totalStudents: number;
    avgAttendance: number;
    avgHomeworkScore: number;
    avgExamScore: number;
    totalHomeworks: number;
    totalAssessments: number;
    totalSessions: number;
  };
  students: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    attendancePercent: number;
    attendancePresent: number;
    attendanceTotal: number;
    homeworkCompleted: number;
    homeworkTotal: number;
    homeworkAvgScore: number;
    examsPassed: number;
    examsTotal: number;
    examAvgScore: number;
    overallScore: number;
  }[];
}

export interface GroupInput {
  name?: string;
  branchId?: string;
  description?: string;
  schedule?: string;
  scheduleDays?: number[];
  teacherId?: string;
  startDate?: string;
  endDate?: string;
  price?: number | "";
  isActive?: boolean;
  sortOrder?: number;
}

// ---------- браузер ----------

export const createGroup = (courseId: string, body: GroupInput & { name: string }) =>
  apiFetch<ApiGroup>("/groups", { method: "POST", body: { courseId, ...body } });

export const updateGroup = (groupId: string, body: GroupInput) =>
  apiFetch<ApiGroup>(`/groups/${groupId}`, { method: "PATCH", body });

export const deleteGroup = (groupId: string) =>
  apiFetch<{ id: string }>(`/groups/${groupId}`, { method: "DELETE" });

export const toggleGroupActive = (groupId: string) =>
  apiFetch<ApiGroup>(`/groups/${groupId}/toggle-active`, { method: "POST" });

export const addStudentsToGroup = (groupId: string, studentIds: string[]) =>
  apiFetch<{ added: number }>(`/groups/${groupId}/students`, { method: "POST", body: { studentIds } });

export const removeStudentFromGroup = (groupId: string, studentId: string, alsoUnenroll = false) =>
  apiFetch<{ studentId: string; alsoUnenroll: boolean }>(`/groups/${groupId}/students/${studentId}`, {
    method: "DELETE",
    query: { alsoUnenroll: String(alsoUnenroll) },
  });

export const moveStudentToGroup = (studentId: string, courseId: string, toGroupId: string) =>
  apiFetch<{ studentId: string; toGroupId: string }>(`/groups/${toGroupId}/move-student`, {
    method: "POST",
    body: { studentId, courseId },
  });

export const getCourseGroups = (courseId: string) =>
  apiFetch<ApiGroup[]>("/groups/by-course", { query: { courseId } });

export const getAllGroups = (branchId?: string) =>
  apiFetch<ApiGroupWithCourse[]>("/groups", { query: { branchId } });

export const getAvailableStudentsForGroup = (groupId: string) =>
  apiFetch<ApiGroupCandidate[]>(`/groups/${groupId}/available-students`);

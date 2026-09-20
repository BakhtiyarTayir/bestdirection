import "server-only";
import type {
  ApiGroup,
  ApiGroupWithCourse,
  ApiGroupCandidate,
  ApiGroupDetails,
  ApiGroupStatistics,
  ApiGroupStudent,
  ApiTeacherOption,
} from "./groups";
import { apiServerFetch } from "./server";

// Те же маршруты групп для серверных компонентов, см. users.server.

export const getAllGroups = (branchId?: string) =>
  apiServerFetch<ApiGroupWithCourse[]>("/groups", { query: { branchId } });

export const getCourseGroups = (courseId: string) =>
  apiServerFetch<ApiGroup[]>("/groups/by-course", { query: { courseId } });

export const getGroupDetails = (groupId: string) =>
  apiServerFetch<ApiGroupDetails>(`/groups/${groupId}`);

export const getGroupStatistics = (groupId: string) =>
  apiServerFetch<ApiGroupStatistics>(`/groups/${groupId}/statistics`);

export const getUngroupedStudents = (courseId: string) =>
  apiServerFetch<ApiGroupStudent[]>("/groups/ungrouped-students", { query: { courseId } });

export const getAvailableStudentsForGroup = (groupId: string) =>
  apiServerFetch<ApiGroupCandidate[]>(`/groups/${groupId}/available-students`);

export const getTeacherOptions = () => apiServerFetch<ApiTeacherOption[]>("/groups/teacher-options");

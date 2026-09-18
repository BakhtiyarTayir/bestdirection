import "server-only";
import type {
  ApiAvailableStudent,
  ApiCatalogCourse,
  ApiCourse,
  ApiCourseForCopy,
  ApiDeletedCourse,
  ApiDeletedLesson,
  ApiEnrolledStudent,
  ApiEnrollmentRequest,
} from "./courses";
import { apiServerFetch } from "./server";

// Те же маршруты курсов для серверных компонентов, см. users.server.

export const getCourses = () => apiServerFetch<ApiCourse[]>("/courses");
export const getCourseById = (id: string) => apiServerFetch<ApiCourse>(`/courses/${id}`);

/** Адреса кабинета построены на slug, связи в базе — на id. */
export const getCourseIdBySlug = (slug: string) =>
  apiServerFetch<{ id: string }>(`/courses/slug/${slug}`);

export const getEnrolledStudents = (courseId: string, groupId?: string) =>
  apiServerFetch<ApiEnrolledStudent[]>(`/courses/${courseId}/students`, { query: { groupId } });

export const getAvailableStudents = (courseId: string) =>
  apiServerFetch<ApiAvailableStudent[]>(`/courses/${courseId}/available-students`);

export const getCoursesForCopy = () => apiServerFetch<ApiCourseForCopy[]>("/courses/for-copy");

export const getCourseLineage = (courseId: string) =>
  apiServerFetch<{
    id: string;
    title: string;
    copiedAt: string | null;
    teacher: { firstName: string; lastName: string };
    copiedFrom: {
      id: string;
      title: string;
      copiedAt: string | null;
      teacher: { firstName: string; lastName: string };
    } | null;
    copies: {
      id: string;
      title: string;
      copiedAt: string | null;
      teacher: { firstName: string; lastName: string };
    }[];
  }>(`/courses/${courseId}/lineage`);

export const getCatalogCourses = () =>
  apiServerFetch<ApiCatalogCourse[]>("/enrollment-requests/catalog");

export const getEnrollmentRequests = () =>
  apiServerFetch<ApiEnrollmentRequest[]>("/enrollment-requests");

export const getEnrollmentRequestsCount = () =>
  apiServerFetch<{ count: number }>("/enrollment-requests/count");

export const getDeletedCourses = () => apiServerFetch<ApiDeletedCourse[]>("/trash/courses");
export const getDeletedLessons = () => apiServerFetch<ApiDeletedLesson[]>("/trash/lessons");

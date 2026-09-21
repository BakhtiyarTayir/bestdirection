import { apiFetch } from "./client";

// Модуль courses в api: курсы, записи, заявки, копирование, Корзина.
// Серверные компоненты берут те же маршруты из ./courses.server.

export type CourseAccessType = "CLOSED" | "FREE" | "PAID";

export interface ApiCourseTeacher {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ApiCourse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  isPublished: boolean;
  isTemplate: boolean;
  sortOrder: number;
  accessType: CourseAccessType;
  isPublicListed: boolean;
  price: number | null;
  publicSummaryRu: string | null;
  publicSummaryUz: string | null;
  intakeStartDate: string | null;
  intakeSeats: number | null;
  intakeNoteRu: string | null;
  intakeNoteUz: string | null;
  teacherId: string;
  createdAt: string;
  updatedAt: string;
  teacher: ApiCourseTeacher;
  _count: { enrollments: number; lessons: number; copies?: number };
  copiedFrom?: {
    id: string;
    slug: string;
    title: string;
    teacher: { firstName: string; lastName: string };
  } | null;
}

export interface ApiEnrolledStudent {
  id: string;
  firstName: string;
  lastName: string;
  login: string | null;
  phone: string | null;
  isActive: boolean;
  enrolledAt: string;
}

export interface ApiCatalogCourse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  accessType: CourseAccessType;
  price: number | null;
  intakeSeats: number | null;
  teacher: { firstName: string; lastName: string };
  _count: { enrollments: number; lessons: number };
  isEnrolled: boolean;
  myRequestStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  seatsLeft: number | null;
}

export interface ApiEnrollmentRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  courseId: string;
  studentId: string;
  course: { id: string; title: string; slug: string; price: number | null };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    login: string | null;
    phone: string | null;
    telegramUsername: string | null;
  };
  reviewedBy: { firstName: string; lastName: string } | null;
}

export interface ApiCourseForCopy {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  isTemplate: boolean;
  createdAt: string;
  teacher: { id: string; firstName: string; lastName: string };
  _count: { lessons: number; assessments: number; copies: number };
}

export interface ApiDeletedCourse {
  id: string;
  title: string;
  slug: string;
  deletedAt: string;
  teacher: { firstName: string; lastName: string };
  _count: { lessons: number; enrollments: number };
}

export interface ApiDeletedLesson {
  id: string;
  title: string;
  slug: string;
  deletedAt: string;
  course: { id: string; title: string; slug: string; deletedAt: string | null };
}

export interface CourseInput {
  title?: string;
  description?: string;
  coverImage?: string | null;
  isPublished?: boolean;
  sortOrder?: number;
  accessType?: CourseAccessType;
  isPublicListed?: boolean;
  price?: number;
  publicSummaryRu?: string;
  publicSummaryUz?: string;
  intakeStartDate?: string;
  intakeSeats?: number;
  intakeNoteRu?: string;
  intakeNoteUz?: string;
}

// ---------- браузер ----------

export const createCourse = (body: CourseInput & { title: string; teacherId: string }) =>
  apiFetch<ApiCourse>("/courses", { method: "POST", body });

export const updateCourse = (id: string, body: CourseInput) =>
  apiFetch<ApiCourse>(`/courses/${id}`, { method: "PATCH", body });

export const deleteCourse = (id: string) => apiFetch<{ ok: true }>(`/courses/${id}`, { method: "DELETE" });

export const copyCourse = (sourceCourseId: string, options: { newTitle?: string } = {}) =>
  apiFetch<{ id: string; title: string; slug: string }>("/courses/copy", {
    method: "POST",
    body: { sourceCourseId, ...options },
  });

export const enrollInFreeCourse = (courseId: string) =>
  apiFetch<{ courseSlug: string }>("/enrollment-requests/free-enroll", { method: "POST", body: { courseId } });

export const requestEnrollment = (courseId: string) =>
  apiFetch<{ ok: true }>("/enrollment-requests", { method: "POST", body: { courseId } });

export const approveEnrollmentRequest = (requestId: string) =>
  apiFetch<{ ok: true }>("/enrollment-requests/approve", { method: "POST", body: { requestId } });

export const rejectEnrollmentRequest = (requestId: string) =>
  apiFetch<{ ok: true }>("/enrollment-requests/reject", { method: "POST", body: { requestId } });

export const restoreCourse = (id: string) =>
  apiFetch<{ ok: true }>(`/trash/courses/${id}/restore`, { method: "POST" });

export const restoreLesson = (id: string) =>
  apiFetch<{ ok: true }>(`/trash/lessons/${id}/restore`, { method: "POST" });

export const hardDeleteCourse = (id: string) =>
  apiFetch<{ ok: true }>(`/trash/courses/${id}`, { method: "DELETE" });

export const hardDeleteLesson = (id: string) =>
  apiFetch<{ ok: true }>(`/trash/lessons/${id}`, { method: "DELETE" });

// ---------- сравнение курсов ----------

export interface CourseDiffSummary {
  lessonsAdded: number;
  lessonsRemoved: number;
  lessonsModified: number;
  lessonsUnchanged: number;
  examsAdded: number;
  examsRemoved: number;
  examsModified: number;
  examsUnchanged: number;
}

interface LessonSnapshot {
  id: string;
  title: string;
  contentPreview: string | null;
  videoUrl: string | null;
  sortOrder: number;
  hasAssessment: boolean;
  questionsCount: number;
}

interface AssessmentSnapshot {
  id: string;
  title: string;
  passingScore: number;
  timeLimitMin: number | null;
  maxAttempts: number;
  questionsCount: number;
}

interface FieldChange {
  field: string;
  valueA: string;
  valueB: string;
}

export interface CourseDiff {
  courseA: { id: string; title: string; teacherName: string };
  courseB: { id: string; title: string; teacherName: string };
  summary: CourseDiffSummary;
  lessons: {
    status: "added" | "removed" | "modified" | "unchanged";
    lessonA: LessonSnapshot | null;
    lessonB: LessonSnapshot | null;
    changes: FieldChange[];
  }[];
  exams: {
    status: "added" | "removed" | "modified" | "unchanged";
    assessmentA: AssessmentSnapshot | null;
    assessmentB: AssessmentSnapshot | null;
    changes: FieldChange[];
  }[];
}

export const compareCourses = (courseAId: string, courseBId: string) =>
  apiFetch<CourseDiff>("/courses/compare", { query: { courseAId, courseBId } });

export const getCoursesForComparison = () =>
  apiFetch<
    { id: string; title: string; teacher: { firstName: string; lastName: string }; _count: { lessons: number } }[]
  >("/courses/for-comparison");

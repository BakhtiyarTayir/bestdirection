import "server-only";
import type {
  ApiAssessment,
  ApiAssessmentSummary,
  ApiAttempt,
  ApiLesson,
  ApiLessonDetails,
  ApiOwnAttempt,
} from "./lessons";
import { apiServerFetch } from "./server";

// Те же маршруты уроков и тестов для серверных компонентов.

export const getLessons = (courseId: string) =>
  apiServerFetch<ApiLesson[]>("/lessons", { query: { courseId } });

export const getLessonById = (id: string) => apiServerFetch<ApiLessonDetails>(`/lessons/${id}`);

export const getLessonIdBySlug = (courseId: string, lessonSlug: string) =>
  apiServerFetch<{ id: string }>(`/lessons/slug/${courseId}/${lessonSlug}`);

export const getCourseLessonNav = (courseSlug: string) =>
  apiServerFetch<{
    courseTitle: string;
    lessons: {
      id: string;
      slug: string;
      title: string;
      isPublished: boolean;
      videoUrl: string | null;
      sortOrder: number;
    }[];
    completedIds: string[];
  }>("/lessons/nav", { query: { courseSlug } });

export const getCourseProgress = (courseId: string) =>
  apiServerFetch<{ total: number; completed: number; percentage: number }>("/lessons/progress", {
    query: { courseId },
  });

export const getLessonProgress = (lessonId: string) =>
  apiServerFetch<{ watchTime: number; lastPosition: number; completedAt: string | null } | null>(
    `/lessons/${lessonId}/progress`
  );

export const getAssessment = (assessmentId: string) =>
  apiServerFetch<ApiAssessment>(`/assessments/${assessmentId}`);

export const getTestByLesson = (lessonId: string) =>
  apiServerFetch<ApiAssessment>("/assessments/by-lesson", { query: { lessonId } });

export const getAssessmentsByCourse = (courseId: string, type?: "TEST" | "EXAM") =>
  apiServerFetch<ApiAssessmentSummary[]>("/assessments", { query: { courseId, type } });

export const getAssessmentAttempts = (assessmentId: string) =>
  apiServerFetch<ApiAttempt[]>(`/assessments/${assessmentId}/attempts`);

export const getMyAssessmentAttempts = (assessmentId: string) =>
  apiServerFetch<ApiOwnAttempt[]>(`/assessments/${assessmentId}/attempts/mine`);

export const getMyBestAttempt = (assessmentId: string) =>
  apiServerFetch<{ percentage: number; isPassed: boolean } | null>(
    `/assessments/${assessmentId}/attempts/best`
  );

export const getStudentAssessmentResults = (studentId?: string) =>
  apiServerFetch<ApiAttempt[]>("/assessments/results", { query: { studentId } });

export const checkCourseExamEligibility = (courseId: string) =>
  apiServerFetch<{ eligible: boolean; unpassedTests: { lessonTitle: string; testTitle: string }[] }>(
    "/assessments/eligibility",
    { query: { courseId } }
  );

export const checkAssessmentEligibility = (assessmentId: string) =>
  apiServerFetch<{ eligible: boolean; unpassedTests: { lessonTitle: string; testTitle: string }[] }>(
    `/assessments/${assessmentId}/eligibility`
  );

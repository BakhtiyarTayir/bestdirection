import { apiFetch, apiUpload } from "./client";

// Модули lessons и assessments в api. Серверные компоненты берут те же
// маршруты из ./lessons.server.

export type ContentFormat = "MARKDOWN" | "HTML";
export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
export type AssessmentType = "TEST" | "EXAM";

export interface ApiLesson {
  id: string;
  slug: string;
  title: string;
  content: string;
  contentFormat: ContentFormat;
  videoUrl: string | null;
  videoSource: "YOUTUBE" | "UPLOAD" | null;
  sortOrder: number;
  isPublished: boolean;
  courseId: string;
  createdAt: string;
  updatedAt: string;
  assessment?: { id: string; title: string; isPublished: boolean } | null;
}

export interface ApiLessonDetails extends ApiLesson {
  course: { id: string; title: string; teacherId: string };
  assessment: {
    id: string;
    title: string;
    passingScore: number;
    timeLimitMin: number | null;
    maxAttempts: number;
    isPublished: boolean;
  } | null;
  homeworks: {
    id: string;
    slug: string;
    title: string;
    language: string | null;
    isPublished: boolean;
    passingScore: number;
  }[];
}

export interface ApiAssessmentOption {
  id: string;
  text: string;
  sortOrder: number;
  questionId: string;
  // Приходит только персоналу: ученик и родитель ключей не видят
  isCorrect?: boolean;
}

export interface ApiAssessmentQuestion {
  id: string;
  text: string;
  type: QuestionType;
  points: number;
  sortOrder: number;
  assessmentId: string;
  options: ApiAssessmentOption[];
}

/** Ответ ученика в его же попытке: показывается после завершения. */
export interface ApiAttemptAnswer {
  id: string;
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  pointsEarned: number;
  question: {
    id: string;
    text: string;
    type: QuestionType;
    points: number;
    options: { id: string; text: string; isCorrect: boolean }[];
  };
}

export interface ApiAssessment {
  id: string;
  type: AssessmentType;
  title: string;
  description: string | null;
  passingScore: number;
  timeLimitMin: number | null;
  maxAttempts: number;
  sortOrder: number;
  isPublished: boolean;
  courseId: string;
  lessonId: string | null;
  course?: { id: string; title: string; teacherId: string };
  lesson?: { id: string; title: string } | null;
  questions: ApiAssessmentQuestion[];
  _count?: { attempts: number };
}

export interface ApiAssessmentSummary {
  id: string;
  type: AssessmentType;
  title: string;
  description: string | null;
  passingScore: number;
  timeLimitMin: number | null;
  maxAttempts: number;
  sortOrder: number;
  isPublished: boolean;
  lesson: { id: string; title: string } | null;
  _count: { questions: number; attempts: number };
}

export interface ApiAttempt {
  id: string;
  studentId: string;
  score: number;
  maxScore: number;
  percentage: number;
  isPassed: boolean;
  attemptNumber: number;
  startedAt: string;
  completedAt: string | null;
  student?: { id: string; firstName: string; lastName: string; login: string | null };
  /** Приходит там, где ответы вправе видеть: свои попытки и разбор для преподавателя. */
  answers?: ApiAttemptAnswer[];
  assessment?: {
    id: string;
    title: string;
    type: AssessmentType;
    passingScore: number;
    maxAttempts: number;
    lessonId: string | null;
    lesson: { id: string; slug: string; title: string } | null;
    course: { id: string; slug: string; title: string };
  };
}

export interface ApiStartedAttempt {
  id: string;
  attemptNumber: number;
  startedAt: string;
  timeLimitMin: number | null;
  /** Крайний срок считает сервер: браузерный таймер — только отображение. */
  expiresAt: string | null;
}

// ---------- браузер ----------

export const createLesson = (body: {
  courseId: string;
  title: string;
  content?: string;
  contentFormat?: ContentFormat;
  videoUrl?: string;
  videoSource?: "YOUTUBE" | "UPLOAD";
  sortOrder?: number;
  isPublished?: boolean;
}) => apiFetch<ApiLesson>("/lessons", { method: "POST", body });

export const updateLesson = (
  id: string,
  body: {
    title?: string;
    content?: string;
    contentFormat?: ContentFormat;
    videoUrl?: string;
    videoSource?: "YOUTUBE" | "UPLOAD";
    sortOrder?: number;
    isPublished?: boolean;
  }
) => apiFetch<ApiLesson>(`/lessons/${id}`, { method: "PATCH", body });

export const deleteLesson = (id: string) => apiFetch<{ ok: true }>(`/lessons/${id}`, { method: "DELETE" });

export const markLessonComplete = (lessonId: string) =>
  apiFetch<{ completedAt: string | null }>(`/lessons/${lessonId}/complete`, { method: "POST" });

export const updateLessonProgress = (lessonId: string, body: { watchTime: number; lastPosition: number }) =>
  apiFetch<{ watchTime: number; lastPosition: number }>(`/lessons/${lessonId}/progress`, {
    method: "POST",
    body,
  });

export const createAssessment = (body: {
  courseId: string;
  lessonId?: string;
  type: AssessmentType;
  title: string;
  description?: string;
  passingScore?: number;
  timeLimitMin?: number | null;
  maxAttempts?: number;
  isPublished?: boolean;
}) => apiFetch<ApiAssessment>("/assessments", { method: "POST", body });

export const updateAssessment = (
  id: string,
  body: {
    title?: string;
    description?: string;
    passingScore?: number;
    timeLimitMin?: number | null;
    maxAttempts?: number;
    isPublished?: boolean;
  }
) => apiFetch<ApiAssessment>(`/assessments/${id}`, { method: "PATCH", body });

export const deleteAssessment = (id: string) =>
  apiFetch<{ ok: true }>(`/assessments/${id}`, { method: "DELETE" });

export const addAssessmentQuestion = (body: {
  assessmentId: string;
  text: string;
  type: QuestionType;
  points?: number;
  sortOrder?: number;
  options: { text: string; isCorrect?: boolean; sortOrder?: number }[];
}) => apiFetch<ApiAssessmentQuestion>("/assessments/questions", { method: "POST", body });

export const updateAssessmentQuestion = (
  id: string,
  body: {
    text?: string;
    type?: QuestionType;
    points?: number;
    sortOrder?: number;
    options?: { text: string; isCorrect?: boolean; sortOrder?: number }[];
  }
) => apiFetch<ApiAssessmentQuestion>(`/assessments/questions/${id}`, { method: "PATCH", body });

export const deleteAssessmentQuestion = (id: string) =>
  apiFetch<{ ok: true }>(`/assessments/questions/${id}`, { method: "DELETE" });

export const checkAssessmentEligibility = (assessmentId: string) =>
  apiFetch<{ eligible: boolean; unpassedTests: { lessonTitle: string; testTitle: string }[] }>(
    `/assessments/${assessmentId}/eligibility`
  );

/** Начало попытки: с этого момента сервер считает время. */
export const startAssessmentAttempt = (assessmentId: string) =>
  apiFetch<ApiStartedAttempt>(`/assessments/${assessmentId}/attempts`, { method: "POST" });

export const submitAssessmentAttempt = (
  attemptId: string,
  body: { answers: { questionId: string; selectedOptionIds: string[] }[] }
) => apiFetch<ApiAttempt>(`/assessments/attempts/${attemptId}/submit`, { method: "POST", body });

export const getCourseLessonNav = (courseSlug: string) =>
  apiFetch<{
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

/**
 * Загрузка таблицы с вопросами. Отдельно от apiFetch: тело — FormData, и
 * Content-Type браузер проставляет сам вместе с границей частей.
 */


export interface ImportResult {
  id: string;
  title: string;
  questions: number;
}

export const importTestFromFile = (lessonId: string, file: File) =>
  apiUpload<ImportResult>(`/assessments/import/test/${lessonId}`, file);

export const importExamFromFile = (courseId: string, file: File) =>
  apiUpload<ImportResult>(`/assessments/import/exam/${courseId}`, file);

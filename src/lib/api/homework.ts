import { apiFetch, apiUpload } from "./client";

// Модуль homework в api: задания, сдачи и их проверка. Серверные компоненты
// берут те же маршруты из ./homework.server.

export type HomeworkType = "CODE" | "TEXT" | "FILE";
export type ProgrammingLanguage =
  | "PYTHON"
  | "JAVASCRIPT"
  | "TYPESCRIPT"
  | "PHP"
  | "JAVA"
  | "CSHARP";
export type SubmissionStatus = "PENDING" | "RUNNING" | "PASSED" | "PARTIAL" | "FAILED" | "ERROR";
export type ManualReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION";

export interface ApiTestCase {
  id: string;
  input: string | null;
  expected: string | null;
  isHidden?: boolean;
  points: number;
  description: string | null;
  sortOrder: number;
}

export interface ApiHomework {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: HomeworkType;
  language: ProgrammingLanguage | null;
  starterCode: string | null;
  solutionCode?: string | null;
  maxAttempts: number;
  timeLimitSec: number;
  maxScore: number;
  passingScore: number;
  dueDate: string | null;
  allowLate: boolean;
  latePenalty: number;
  sortOrder: number;
  isPublished: boolean;
  requiresManualReview: boolean;
  reviewInstructions?: string | null;
  lessonId: string;
  testCases?: ApiTestCase[];
  _count?: { testCases: number; submissions: number };
}

export interface ApiSubmissionFile {
  id: string;
  filename: string;
  size: number;
  path?: string;
  mimeType?: string;
}

export interface ApiTestResult {
  id: string;
  passed: boolean;
  actualOutput: string | null;
  errorOutput: string | null;
  executionTime: number | null;
  testCaseId: string;
  testCase: {
    id?: string;
    input: string | null;
    expected: string | null;
    description: string | null;
    /** У скрытой проверки ученику приходит только этот признак и passed. */
    isHidden?: boolean;
  };
}

export interface ApiSubmission {
  id: string;
  code: string;
  status: SubmissionStatus;
  score: number;
  maxScore: number;
  percentage: number;
  isLate: boolean;
  penalty: number;
  finalScore: number;
  attemptNumber: number;
  createdAt: string;
  manualStatus: ManualReviewStatus | null;
  teacherComment: string | null;
  manualScore: number | null;
  reviewedAt: string | null;
  studentId: string;
  homeworkId: string;
  files?: ApiSubmissionFile[];
  testResults?: ApiTestResult[];
  student?: { id: string; firstName: string; lastName: string; email?: string | null };
  reviewedBy?: { firstName: string; lastName: string } | null;
}

export interface ApiHomeworkForStudent {
  homework: ApiHomework & {
    lesson: {
      id: string;
      slug: string;
      title: string;
      courseId: string;
      course: { id: string; slug: string; title: string };
    };
  };
  submissions: ApiSubmission[];
  attemptsUsed: number;
  attemptsRemaining: number;
}

// ---------- браузер ----------

export const createHomework = (body: {
  lessonId: string;
  title: string;
  description: string;
  type?: HomeworkType;
  language?: ProgrammingLanguage;
  starterCode?: string;
  solutionCode?: string;
  maxAttempts?: number;
  timeLimitSec?: number;
  passingScore?: number;
  dueDate?: string | null;
  allowLate?: boolean;
  latePenalty?: number;
  isPublished?: boolean;
  testCases?: {
    input: string;
    expected: string;
    isHidden?: boolean;
    points?: number;
    description?: string | null;
  }[];
}) => apiFetch<ApiHomework>("/homework", { method: "POST", body });

export const updateHomework = (
  id: string,
  body: Partial<Omit<Parameters<typeof createHomework>[0], "lessonId">>
) => apiFetch<ApiHomework>(`/homework/${id}`, { method: "PATCH", body });

export const deleteHomework = (id: string) =>
  apiFetch<{ ok: true }>(`/homework/${id}`, { method: "DELETE" });

export const toggleHomeworkPublished = (id: string) =>
  apiFetch<ApiHomework>(`/homework/${id}/publish`, { method: "POST" });

export const getHomeworkCounts = () => apiFetch<{ count: number }>("/homework/counts");

/** Сдача текстом: файловые работы уходят через uploadSubmissionFile. */
export const submitSolution = (homeworkId: string, code: string) =>
  apiFetch<ApiSubmission>(`/homework/${homeworkId}/submissions`, {
    method: "POST",
    body: { code },
  });

export const uploadSubmissionFile = (homeworkId: string, file: File) =>
  apiUpload<{ submissionId: string; attemptNumber: number; files: ApiSubmissionFile[] }>(
    `/homework/${homeworkId}/submissions/file`,
    file
  );

export const importHomeworkFromFile = (lessonId: string, file: File) =>
  apiUpload<{ count: number }>(`/homework/import/${lessonId}`, file);

export const reviewSubmission = (
  submissionId: string,
  body: { status: "APPROVED" | "REJECTED" | "REVISION"; comment?: string; manualScore?: number | null }
) => apiFetch<ApiSubmission>(`/submissions/${submissionId}/review`, { method: "POST", body });

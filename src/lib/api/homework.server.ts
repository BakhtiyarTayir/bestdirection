import "server-only";
import type {
  ApiHomework,
  ApiHomeworkForStudent,
  ApiSubmission,
  ApiSubmissionFile,
  ApiTestResult,
} from "./homework";
import { apiServerFetch } from "./server";

// Те же маршруты заданий для серверных компонентов.

export const getLessonHomeworks = (lessonId: string) =>
  apiServerFetch<ApiHomework[]>("/homework", { query: { lessonId } });

/** Задание преподавателю: со скрытыми проверками и эталонным решением. */
export const getHomeworkForTeacher = (id: string) =>
  apiServerFetch<
    ApiHomework & {
      lesson: {
        id: string;
        title: string;
        courseId: string;
        course: { id: string; title: string };
      };
      _count: { submissions: number };
    }
  >(`/homework/${id}`);

/** Задание ученику: без скрытых проверок, вместе со своими сдачами. */
export const getHomeworkForStudent = (id: string) =>
  apiServerFetch<ApiHomeworkForStudent>(`/homework/${id}/student`);

/** Задания ученика по всем его курсам. */
export const getStudentHomeworks = () =>
  apiServerFetch<
    (ApiHomework & {
      lesson: {
        id: string;
        slug: string;
        title: string;
        course: { id: string; slug: string; title: string };
      };
      submissions: Pick<
        ApiSubmission,
        "id" | "status" | "manualStatus" | "percentage" | "attemptNumber" | "teacherComment" | "createdAt"
      >[];
      _count: { testCases: number };
    })[]
  >("/homework/my");

export const getHomeworkSubmissions = (homeworkId: string) =>
  apiServerFetch<ApiSubmission[]>(`/homework/${homeworkId}/submissions`);

type WithStudent = { student: { id: string; firstName: string; lastName: string } };

/** Разбор работы: api отдаёт их всегда, поэтому здесь они обязательны. */
type WithDetails = {
  files: ApiSubmissionFile[];
  testResults: ApiTestResult[];
  reviewedBy: { firstName: string; lastName: string } | null;
};

export const getPendingReviewSubmissions = () =>
  apiServerFetch<
    (ApiSubmission &
      WithStudent & {
      homework: ApiHomework & {
        lesson: {
          id: string;
          slug: string;
          title: string;
          course: { id: string; slug: string; title: string };
        };
        _count: { testCases: number };
      };
    })[]
  >("/submissions/pending");

export const getReviewHistory = () =>
  apiServerFetch<
    (ApiSubmission &
      WithStudent & {
      homework: ApiHomework & {
        lesson: { slug: string; title: string; course: { slug: string; title: string } };
      };
    })[]
  >("/submissions/history");

export const getSubmissionForReview = (submissionId: string) =>
  apiServerFetch<
    ApiSubmission &
      WithStudent &
      WithDetails & {
      homework: ApiHomework & {
        lesson: {
          slug: string;
          title: string;
          courseId: string;
          course: { slug: string; title: string; teacherId: string };
        };
        testCases: { id: string; description: string | null; isHidden: boolean }[];
      };
    }
  >(`/submissions/${submissionId}`);

export const getHomeworkCounts = () => apiServerFetch<{ count: number }>("/homework/counts");

/** Лучший результат ученика по каждому заданию урока. */
export const getMyBestSubmissions = (lessonId: string) =>
  apiServerFetch<{ homeworkId: string; percentage: number }[]>("/homework/my/best", {
    query: { lessonId },
  });

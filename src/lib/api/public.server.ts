import "server-only";
import { apiServerFetch } from "./server";

// Публичные страницы урока и задания. Гостю открыты только бесплатные курсы —
// это решает api, интерфейс просто ведёт на вход, когда ответа нет.

export interface PublicLesson {
  lesson: {
    id: string;
    title: string;
    content: string;
    contentFormat: "MARKDOWN" | "HTML";
    courseId: string;
    course: { title: string };
    homeworks: {
      id: string;
      slug: string;
      title: string;
      language: string | null;
      passingScore: number;
    }[];
  };
  siblings: { id: string; slug: string; title: string }[];
}

export interface PublicHomework {
  title: string;
  description: string;
  type: "CODE" | "TEXT" | "FILE";
  language: string | null;
  passingScore: number;
  maxAttempts: number;
  timeLimitSec: number;
  testCases: { id: string; input: string; expected: string; description: string | null }[];
}

export const getPublicLesson = (courseSlug: string, lessonSlug: string) =>
  apiServerFetch<PublicLesson>(`/public/lessons/${courseSlug}/${lessonSlug}`);

export const getPublicHomework = (courseSlug: string, lessonSlug: string, homeworkSlug: string) =>
  apiServerFetch<PublicHomework>(`/public/homework/${courseSlug}/${lessonSlug}/${homeworkSlug}`);

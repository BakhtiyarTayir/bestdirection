import { notFound } from "next/navigation";
import { resolvePath } from "@/lib/api/dashboard.server";

/**
 * Адреса кабинета построены на slug. Превращает их в идентификаторы — этим
 * занимается api и сразу по правам вызывающего: чужой курс, черновик урока и
 * неопубликованное задание отдаются как несуществующие.
 */
export async function resolveCourseSlug(courseSlug: string): Promise<string> {
  const result = await resolvePath({ courseSlug });
  if (!result.success) notFound();
  return result.data.courseId;
}

export async function resolveLessonSlug(courseSlug: string, lessonSlug: string): Promise<string> {
  const result = await resolvePath({ courseSlug, lessonSlug });
  if (!result.success || !result.data.lessonId) notFound();
  return result.data.lessonId;
}

export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug: string;
  homeworkSlug: string;
}): Promise<{ courseId: string; lessonId: string; homeworkId: string }>;
export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug: string;
  homeworkSlug?: undefined;
}): Promise<{ courseId: string; lessonId: string }>;
export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug?: undefined;
  homeworkSlug?: undefined;
}): Promise<{ courseId: string }>;
export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug?: string;
  homeworkSlug?: string;
}): Promise<{ courseId: string; lessonId?: string; homeworkId?: string }> {
  const result = await resolvePath(params);
  if (!result.success) notFound();

  // Запрошенная часть адреса обязана разрешиться: иначе это не тот адрес
  if (params.lessonSlug && !result.data.lessonId) notFound();
  if (params.homeworkSlug && !result.data.homeworkId) notFound();

  return result.data;
}

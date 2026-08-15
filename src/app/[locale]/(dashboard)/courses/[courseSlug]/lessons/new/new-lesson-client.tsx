"use client";

import { LessonForm } from "@/components/lesson-form";
import type { LessonFormSubmitData } from "@/components/lesson-form";
import { createLesson } from "@/actions/lesson-actions";

interface NewLessonClientProps {
  courseSlug: string;
  courseId: string;
}

export function NewLessonClient({ courseSlug, courseId }: NewLessonClientProps) {
  async function handleSubmit(data: LessonFormSubmitData) {
    const result = await createLesson({
      title: data.title,
      content: data.content,
      contentFormat: data.contentFormat,
      videoUrl: data.videoUrl,
      videoSource: data.videoSource,
      sortOrder: data.sortOrder,
      isPublished: data.isPublished,
      courseId,
    });
    return result;
  }

  return <LessonForm courseSlug={courseSlug} onSubmit={handleSubmit} />;
}

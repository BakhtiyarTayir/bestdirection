"use client";

import { LessonForm } from "@/components/lesson-form";
import type { LessonFormSubmitData } from "@/components/lesson-form";
import { createLesson } from "@/actions/lesson-actions";

interface NewLessonClientProps {
  courseId: string;
}

export function NewLessonClient({ courseId }: NewLessonClientProps) {
  async function handleSubmit(data: LessonFormSubmitData) {
    const result = await createLesson({
      title: data.title,
      content: data.content,
      videoUrl: data.videoUrl,
      videoSource: data.videoSource,
      sortOrder: data.sortOrder,
      isPublished: data.isPublished,
      courseId,
    });
    return result;
  }

  return <LessonForm courseId={courseId} onSubmit={handleSubmit} />;
}

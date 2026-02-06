"use client";

import { LessonForm } from "@/components/lesson-form";
import { createLesson } from "@/actions/lesson-actions";

interface NewLessonClientProps {
  courseId: string;
}

export function NewLessonClient({ courseId }: NewLessonClientProps) {
  async function handleSubmit(data: {
    title: string;
    type: "VIDEO" | "TEXT";
    content?: string;
    videoUrl?: string;
    videoSource?: "YOUTUBE" | "UPLOAD";
    sortOrder: number;
    isPublished: boolean;
  }) {
    const result = await createLesson({
      title: data.title,
      type: data.type,
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

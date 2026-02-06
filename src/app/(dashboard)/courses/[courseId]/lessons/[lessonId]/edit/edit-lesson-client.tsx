"use client";

import { LessonForm } from "@/components/lesson-form";
import { updateLesson } from "@/actions/lesson-actions";

interface EditLessonClientProps {
  courseId: string;
  lesson: {
    id: string;
    title: string;
    type: "VIDEO" | "TEXT";
    content: string | null;
    videoUrl: string | null;
    videoSource: "YOUTUBE" | "UPLOAD" | null;
    sortOrder: number;
    isPublished: boolean;
  };
}

export function EditLessonClient({ courseId, lesson }: EditLessonClientProps) {
  async function handleSubmit(data: {
    title: string;
    type: "VIDEO" | "TEXT";
    content?: string;
    videoUrl?: string;
    videoSource?: "YOUTUBE" | "UPLOAD";
    sortOrder: number;
    isPublished: boolean;
  }) {
    const result = await updateLesson(lesson.id, {
      title: data.title,
      type: data.type,
      content: data.content,
      videoUrl: data.videoUrl,
      videoSource: data.videoSource,
      sortOrder: data.sortOrder,
      isPublished: data.isPublished,
    });
    return result;
  }

  return <LessonForm courseId={courseId} lesson={lesson} onSubmit={handleSubmit} />;
}

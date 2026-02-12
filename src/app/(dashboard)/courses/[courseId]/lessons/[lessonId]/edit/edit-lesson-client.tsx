"use client";

import { LessonForm } from "@/components/lesson-form";
import type { LessonFormSubmitData } from "@/components/lesson-form";
import { LessonTestTab } from "@/components/lesson-test-tab";
import type { LessonTestTabAssessment } from "@/components/lesson-test-tab";
import { HomeworkManagement } from "@/components/homework/homework-management";
import { updateLesson } from "@/actions/lesson-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface HomeworkItem {
  id: string;
  title: string;
  language: string | null;
  isPublished: boolean;
  maxAttempts: number;
  passingScore: number;
  _count: { testCases: number; submissions: number };
}

interface EditLessonClientProps {
  courseId: string;
  lesson: {
    id: string;
    title: string;
    content: string | null;
    videoUrl: string | null;
    videoSource: "YOUTUBE" | "UPLOAD" | null;
    sortOrder: number;
    isPublished: boolean;
  };
  assessment: LessonTestTabAssessment | null;
  homeworks: HomeworkItem[];
}

export function EditLessonClient({ courseId, lesson, assessment, homeworks }: EditLessonClientProps) {
  async function handleSubmit(data: LessonFormSubmitData) {
    const result = await updateLesson(lesson.id, {
      title: data.title,
      content: data.content,
      videoUrl: data.videoUrl,
      videoSource: data.videoSource,
      sortOrder: data.sortOrder,
      isPublished: data.isPublished,
    });
    return result;
  }

  return (
    <Tabs defaultValue="lesson">
      <TabsList>
        <TabsTrigger value="lesson">Редактировать урок</TabsTrigger>
        <TabsTrigger value="test">Тесты</TabsTrigger>
        <TabsTrigger value="homework">Домашнее задание</TabsTrigger>
      </TabsList>
      <TabsContent value="lesson" className="mt-6">
        <LessonForm courseId={courseId} lesson={lesson} onSubmit={handleSubmit} />
      </TabsContent>
      <TabsContent value="test" className="mt-6">
        <LessonTestTab courseId={courseId} lessonId={lesson.id} assessment={assessment} />
      </TabsContent>
      <TabsContent value="homework" className="mt-6">
        <HomeworkManagement courseId={courseId} lessonId={lesson.id} homeworks={homeworks} />
      </TabsContent>
    </Tabs>
  );
}

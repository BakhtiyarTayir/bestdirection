"use client";

import { LessonForm } from "@/components/lesson-form";
import type { LessonFormSubmitData } from "@/components/lesson-form";
import { LessonTestTab } from "@/components/lesson-test-tab";
import type { LessonTestTabAssessment } from "@/components/lesson-test-tab";
import { HomeworkManagement } from "@/components/homework/homework-management";
import { updateLesson } from "@/actions/lesson-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";

interface HomeworkItem {
  id: string;
  slug: string;
  title: string;
  language: string | null;
  isPublished: boolean;
  maxAttempts: number;
  passingScore: number;
  _count: { testCases: number; submissions: number };
}

interface EditLessonClientProps {
  courseId: string;
  courseSlug: string;
  lessonSlug: string;
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

export function EditLessonClient({ courseId, courseSlug, lessonSlug, lesson, assessment, homeworks }: EditLessonClientProps) {
  const t = useTranslations("lessons");
  const tHomework = useTranslations("homework");

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
        <TabsTrigger value="lesson">{t("editLesson")}</TabsTrigger>
        <TabsTrigger value="test">{t("testsTab")}</TabsTrigger>
        <TabsTrigger value="homework">{t("homeworkTab")}</TabsTrigger>
      </TabsList>
      <TabsContent value="lesson" className="mt-6">
        <LessonForm courseSlug={courseSlug} lesson={lesson} onSubmit={handleSubmit} />
      </TabsContent>
      <TabsContent value="test" className="mt-6">
        <LessonTestTab courseSlug={courseSlug} lessonSlug={lessonSlug} courseId={courseId} lessonId={lesson.id} assessment={assessment} />
      </TabsContent>
      <TabsContent value="homework" className="mt-6">
        <HomeworkManagement courseSlug={courseSlug} lessonSlug={lessonSlug} homeworks={homeworks} />
      </TabsContent>
    </Tabs>
  );
}

"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { bufferToData, jsonToData, validateSpreadsheetData } from "@/lib/spreadsheet-utils";
import type { QuestionType } from "@/validators/assessment";

// ---------- importTestFromFile ----------
export async function importTestFromFile(formData: FormData) {
  return withAuth(
    async (session) => {
      const lessonId = formData.get("lessonId") as string;
      const file = formData.get("file") as File | null;

      if (!lessonId || !file) {
        return { success: false, error: "Не указан урок или файл" };
      }

      const role = session.user.role;

      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!lesson) return { success: false, error: "Урок не найден" };

      if (role === "TEACHER" && lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "Вы можете импортировать тесты только для своих курсов" };
      }

      const existingTest = await prisma.assessment.findUnique({
        where: { lessonId },
      });

      if (existingTest) {
        return { success: false, error: "У этого урока уже есть тест" };
      }

      let data;
      try {
        if (file.name.endsWith(".json")) {
          const text = await file.text();
          data = jsonToData(text);
        } else {
          const format = file.name.endsWith(".csv") ? "csv" as const : "xlsx" as const;
          const buffer = Buffer.from(await file.arrayBuffer());
          data = bufferToData(buffer, format);
        }
      } catch (e) {
        return {
          success: false,
          error: `Ошибка чтения файла: ${e instanceof Error ? e.message : "неизвестная ошибка"}`,
        };
      }

      const errors = validateSpreadsheetData(data);
      if (errors.length > 0) {
        return { success: false, error: errors.join("; ") };
      }

      const assessment = await prisma.assessment.create({
        data: {
          type: "TEST",
          title: data.title,
          passingScore: data.passingScore,
          timeLimitMin: data.timeLimitMin,
          maxAttempts: data.maxAttempts,
          isPublished: false,
          courseId: lesson.course.id,
          lessonId,
          questions: {
            create: data.questions.map((q, qIdx) => ({
              text: q.text,
              type: q.type as QuestionType,
              points: q.points,
              sortOrder: qIdx,
              options: {
                create: q.options.map((o, oIdx) => ({
                  text: o.text,
                  isCorrect: o.isCorrect,
                  sortOrder: oIdx,
                })),
              },
            })),
          },
        },
      });

      revalidatePath(`/courses/${lesson.course.id}`);
      return { success: true, data: assessment };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- importExamFromFile ----------
export async function importExamFromFile(formData: FormData) {
  return withAuth(
    async (session) => {
      const courseId = formData.get("courseId") as string;
      const file = formData.get("file") as File | null;

      if (!courseId || !file) {
        return { success: false, error: "Не указан курс или файл" };
      }

      const role = session.user.role;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, teacherId: true },
      });

      if (!course) return { success: false, error: "Курс не найден" };

      if (role === "TEACHER" && course.teacherId !== session.user.id) {
        return { success: false, error: "Вы можете импортировать экзамены только для своих курсов" };
      }

      let data;
      try {
        if (file.name.endsWith(".json")) {
          const text = await file.text();
          data = jsonToData(text);
        } else {
          const format = file.name.endsWith(".csv") ? "csv" as const : "xlsx" as const;
          const buffer = Buffer.from(await file.arrayBuffer());
          data = bufferToData(buffer, format);
        }
      } catch (e) {
        return {
          success: false,
          error: `Ошибка чтения файла: ${e instanceof Error ? e.message : "неизвестная ошибка"}`,
        };
      }

      const errors = validateSpreadsheetData(data);
      if (errors.length > 0) {
        return { success: false, error: errors.join("; ") };
      }

      const assessment = await prisma.assessment.create({
        data: {
          type: "EXAM",
          title: data.title,
          description: data.description,
          passingScore: data.passingScore,
          timeLimitMin: data.timeLimitMin,
          maxAttempts: data.maxAttempts,
          isPublished: false,
          courseId,
          questions: {
            create: data.questions.map((q, qIdx) => ({
              text: q.text,
              type: q.type as QuestionType,
              points: q.points,
              sortOrder: qIdx,
              options: {
                create: q.options.map((o, oIdx) => ({
                  text: o.text,
                  isCorrect: o.isCorrect,
                  sortOrder: oIdx,
                })),
              },
            })),
          },
        },
      });

      revalidatePath(`/courses/${courseId}`);
      return { success: true, data: assessment };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

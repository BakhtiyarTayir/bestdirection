"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { bufferToData, jsonToData, validateSpreadsheetData } from "@/lib/spreadsheet-utils";
import { generateUniqueSlug, slugify } from "@/lib/slugify";
import type { QuestionType } from "@/validators/assessment";
import { CODE_HOMEWORK_ENABLED } from "@/lib/code-runner/config";

// ---------- importTestFromFile ----------
export async function importTestFromFile(formData: FormData) {
  return withAuth(
    async (session) => {
      const lessonId = formData.get("lessonId") as string;
      const file = formData.get("file") as File | null;

      if (!lessonId || !file) {
        return { success: false, error: "lessonOrFileRequired" };
      }

      const role = session.user.role;

      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { course: { select: { teacherId: true, id: true } } },
      });

      if (!lesson) return { success: false, error: "lessonNotFound" };

      if (role === "TEACHER" && lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnImportTests" };
      }

      const existingTest = await prisma.assessment.findUnique({
        where: { lessonId },
      });

      if (existingTest) {
        return { success: false, error: "lessonAlreadyHasTest" };
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
          error: `fileReadError: ${e instanceof Error ? e.message : "unknown error"}`,
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

      revalidateLocalized(`/courses/${lesson.course.id}`);
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
        return { success: false, error: "courseOrFileRequired" };
      }

      const role = session.user.role;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, teacherId: true },
      });

      if (!course) return { success: false, error: "courseNotFound" };

      if (role === "TEACHER" && course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnImportExams" };
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
          error: `fileReadError: ${e instanceof Error ? e.message : "unknown error"}`,
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

      revalidateLocalized(`/courses/${courseId}`);
      return { success: true, data: assessment };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- importHomeworkFromFile ----------
type ImportedHomeworkTestCase = {
  input: string;
  expected: string;
  isHidden?: boolean;
  points?: number;
  description?: string | null;
};

type ImportedHomework = {
  title: string;
  description?: string | null;
  type?: "CODE" | "TEXT" | "FILE";
  language?: "PYTHON" | "JAVASCRIPT" | "TYPESCRIPT" | "PHP" | "JAVA" | "CSHARP" | null;
  starterCode?: string | null;
  solutionCode?: string | null;
  maxAttempts?: number;
  timeLimitSec?: number;
  maxScore?: number;
  passingScore?: number;
  dueDate?: string | null;
  allowLate?: boolean;
  latePenalty?: number;
  requiresManualReview?: boolean;
  reviewInstructions?: string | null;
  isPublished?: boolean;
  testCases?: ImportedHomeworkTestCase[];
};

type HomeworkImportPayload = {
  version?: number;
  homeworks?: ImportedHomework[];
};

const HOMEWORK_TYPES = new Set(["CODE", "TEXT", "FILE"]);
const PROGRAMMING_LANGUAGES = new Set([
  "PYTHON",
  "JAVASCRIPT",
  "TYPESCRIPT",
  "PHP",
  "JAVA",
  "CSHARP",
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeImportedHomework(raw: ImportedHomework): ImportedHomework {
  const requestedType = HOMEWORK_TYPES.has(raw.type || "") ? raw.type : "CODE";
  // Пока автопроверка выключена, CODE-задание импортируется как FILE: условие
  // сохраняется, решение преподаватель проверяет вручную.
  const type = requestedType === "CODE" && !CODE_HOMEWORK_ENABLED ? "FILE" : requestedType;
  const language =
    raw.language && PROGRAMMING_LANGUAGES.has(raw.language)
      ? raw.language
      : type === "CODE"
        ? "PYTHON"
        : null;

  return {
    title: String(raw.title || "").trim(),
    description: String(raw.description || "").trim(),
    type,
    language,
    starterCode: raw.starterCode ?? null,
    solutionCode: raw.solutionCode ?? null,
    maxAttempts: clamp(Number(raw.maxAttempts) || 10, 1, 1000),
    timeLimitSec: clamp(Number(raw.timeLimitSec) || 5, 1, 120),
    maxScore: clamp(Number(raw.maxScore) || 100, 1, 1000),
    passingScore: clamp(Number(raw.passingScore) || 60, 1, 100),
    dueDate: raw.dueDate ?? null,
    allowLate: raw.allowLate ?? true,
    latePenalty: clamp(Number(raw.latePenalty) || 20, 0, 100),
    requiresManualReview: raw.requiresManualReview ?? type === "FILE",
    reviewInstructions: raw.reviewInstructions ?? null,
    isPublished: raw.isPublished ?? false,
    testCases: Array.isArray(raw.testCases)
      ? raw.testCases.map((tc) => ({
          input: String(tc.input || ""),
          expected: String(tc.expected || ""),
          isHidden: tc.isHidden ?? false,
          points: clamp(Number(tc.points) || 1, 1, 100),
          description: tc.description ?? null,
        }))
      : [],
  };
}

function parseHomeworkPayload(text: string): ImportedHomework[] {
  const parsed = JSON.parse(text) as HomeworkImportPayload | ImportedHomework[] | ImportedHomework;

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeImportedHomework);
  }

  if (parsed && typeof parsed === "object") {
    if (Array.isArray((parsed as HomeworkImportPayload).homeworks)) {
      return (parsed as HomeworkImportPayload).homeworks!.map(normalizeImportedHomework);
    }

    if ("title" in parsed) {
      return [normalizeImportedHomework(parsed as ImportedHomework)];
    }
  }

  throw new Error("invalidHomeworkImportPayload");
}

export async function importHomeworkFromFile(formData: FormData) {
  return withAuth(
    async (session) => {
      const lessonId = formData.get("lessonId") as string;
      const file = formData.get("file") as File | null;

      if (!lessonId || !file) {
        return { success: false, error: "lessonOrFileRequired" };
      }

      if (!file.name.endsWith(".json")) {
        return { success: false, error: "invalidHomeworkImportFormat" };
      }

      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: {
          course: { select: { id: true, teacherId: true } },
          homeworks: {
            select: { sortOrder: true },
            orderBy: { sortOrder: "desc" },
            take: 1,
          },
        },
      });

      if (!lesson) return { success: false, error: "lessonNotFound" };

      if (session.user.role === "TEACHER" && lesson.course.teacherId !== session.user.id) {
        return { success: false, error: "onlyOwnImportHomeworks" };
      }

      let importedHomeworks: ImportedHomework[];
      try {
        const text = await file.text();
        importedHomeworks = parseHomeworkPayload(text);
      } catch (e) {
        const code = e instanceof Error ? e.message : "unknown";
        if (code === "invalidHomeworkImportPayload") {
          return { success: false, error: "invalidHomeworkImportPayload" };
        }
        return {
          success: false,
          error: `fileReadError: ${e instanceof Error ? e.message : "unknown error"}`,
        };
      }

      if (importedHomeworks.length === 0) {
        return { success: false, error: "homeworkImportEmpty" };
      }

      let nextSortOrder = (lesson.homeworks[0]?.sortOrder ?? -1) + 1;
      let createdCount = 0;

      await prisma.$transaction(async (tx) => {
        for (const raw of importedHomeworks) {
          if (!raw.title.trim()) {
            continue;
          }

          const hw = normalizeImportedHomework(raw);
          const slug = await generateUniqueSlug(
            slugify(hw.title),
            async (s) =>
              !!(await tx.homework.findFirst({
                where: { lessonId, slug: s },
                select: { id: true },
              }))
          );

          const dueDate = hw.dueDate ? new Date(hw.dueDate) : null;
          const safeDueDate = dueDate && !isNaN(dueDate.getTime()) ? dueDate : null;

          const created = await tx.homework.create({
            data: {
              lessonId,
              slug,
              title: hw.title,
              description: hw.description || "",
              type: hw.type ?? "CODE",
              language: hw.type === "CODE" ? (hw.language ?? "PYTHON") : null,
              starterCode: hw.type === "CODE" ? hw.starterCode : null,
              solutionCode: hw.type === "CODE" ? hw.solutionCode : null,
              maxAttempts: hw.maxAttempts ?? 10,
              timeLimitSec: hw.timeLimitSec ?? 5,
              maxScore: hw.maxScore ?? 100,
              passingScore: hw.passingScore ?? 60,
              dueDate: safeDueDate,
              allowLate: hw.allowLate ?? true,
              latePenalty: hw.latePenalty ?? 20,
              sortOrder: nextSortOrder++,
              // Keep imported homeworks as drafts to avoid accidental publication.
              isPublished: false,
              requiresManualReview: hw.type === "FILE" ? true : (hw.requiresManualReview ?? false),
              reviewInstructions: hw.reviewInstructions,
              testCases: hw.type === "CODE" && hw.testCases && hw.testCases.length > 0
                ? {
                    create: hw.testCases.map((tc, index) => ({
                      input: tc.input,
                      expected: tc.expected,
                      isHidden: tc.isHidden ?? false,
                      points: tc.points ?? 1,
                      description: tc.description,
                      sortOrder: index,
                    })),
                  }
                : undefined,
            },
          });

          if (created.id) {
            createdCount++;
          }
        }
      });

      if (createdCount === 0) {
        return { success: false, error: "homeworkImportEmpty" };
      }

      revalidateLocalized(`/courses/${lesson.course.id}`);

      return { success: true, data: { count: createdCount } };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

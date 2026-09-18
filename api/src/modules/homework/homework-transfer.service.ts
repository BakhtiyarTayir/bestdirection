import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import type { SessionUser } from "../../common/auth/session-user";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import { generateUniqueSlug, slugify } from "../../common/slugify";
import { AuditService } from "../../common/audit/audit.service";

/**
 * Выгрузка и загрузка заданий урока. Перенесено из
 * src/app/api/v1/export/homework/[lessonId] и src/actions/import-actions.ts
 * в web. Формат — только JSON: у заданий есть тест-кейсы и коды, таблица их
 * не вмещает.
 */

const HOMEWORK_TYPES = new Set(["CODE", "TEXT", "FILE"]);
const LANGUAGES = ["PYTHON", "JAVASCRIPT", "TYPESCRIPT", "PHP", "JAVA", "CSHARP"] as const;
type Language = (typeof LANGUAGES)[number];

// Автопроверка кода выключена (решение владельца 2026-09-17), поэтому
// CODE-задание загружается как FILE: условие сохраняется, решение проверяет
// преподаватель.
const CODE_HOMEWORK_ENABLED = false;

type HomeworkType = "CODE" | "TEXT" | "FILE";

interface ImportedTestCase {
  input?: unknown;
  expected?: unknown;
  isHidden?: boolean;
  points?: unknown;
  description?: string | null;
}

interface ImportedHomework {
  title?: unknown;
  description?: unknown;
  type?: string;
  language?: string | null;
  starterCode?: string | null;
  solutionCode?: string | null;
  maxAttempts?: unknown;
  timeLimitSec?: unknown;
  maxScore?: unknown;
  passingScore?: unknown;
  dueDate?: string | null;
  allowLate?: boolean;
  latePenalty?: unknown;
  requiresManualReview?: boolean;
  reviewInstructions?: string | null;
  isPublished?: boolean;
  testCases?: ImportedTestCase[];
}

interface NormalizedHomework {
  title: string;
  description: string;
  type: HomeworkType;
  language: Language | null;
  starterCode: string | null;
  solutionCode: string | null;
  maxAttempts: number;
  timeLimitSec: number;
  maxScore: number;
  passingScore: number;
  dueDate: Date | null;
  allowLate: boolean;
  latePenalty: number;
  requiresManualReview: boolean;
  reviewInstructions: string | null;
  testCases: { input: string; expected: string; isHidden: boolean; points: number; description: string | null }[];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

@Injectable()
export class HomeworkTransferService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Все задания урока, включая черновики и скрытые тест-кейсы. */
  async export(lessonId: string, ability: AppAbility) {
    const lesson = await this.manageableLesson(ability, lessonId);

    const full = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: { select: { slug: true } },
        homeworks: {
          orderBy: { sortOrder: "asc" },
          include: { testCases: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!full) throw new NotFoundException("lessonNotFound");

    return {
      filename: `homeworks-${encodeURIComponent(full.title.replace(/\s+/g, "_"))}.json`,
      payload: {
        version: 1,
        exportedAt: new Date().toISOString(),
        lesson: {
          id: lesson.id,
          slug: full.slug,
          title: full.title,
          courseSlug: full.course.slug,
        },
        homeworks: full.homeworks.map((homework) => ({
          title: homework.title,
          description: homework.description,
          type: homework.type,
          language: homework.language,
          starterCode: homework.starterCode,
          solutionCode: homework.solutionCode,
          maxAttempts: homework.maxAttempts,
          timeLimitSec: homework.timeLimitSec,
          maxScore: homework.maxScore,
          passingScore: homework.passingScore,
          dueDate: homework.dueDate,
          allowLate: homework.allowLate,
          latePenalty: homework.latePenalty,
          requiresManualReview: homework.requiresManualReview,
          reviewInstructions: homework.reviewInstructions,
          isPublished: homework.isPublished,
          testCases: homework.testCases.map((testCase) => ({
            input: testCase.input,
            expected: testCase.expected,
            isHidden: testCase.isHidden,
            points: testCase.points,
            description: testCase.description,
            sortOrder: testCase.sortOrder,
          })),
        })),
      },
    };
  }

  /** Загруженные задания всегда остаются черновиками: публикует человек. */
  async import(lessonId: string, content: string, ability: AppAbility, actor: SessionUser) {
    await this.manageableLesson(ability, lessonId);

    const homeworks = this.parse(content);
    if (homeworks.length === 0) throw new BadRequestException("homeworkImportEmpty");

    const last = await this.prisma.homework.findFirst({
      where: { lessonId },
      select: { sortOrder: true },
      orderBy: { sortOrder: "desc" },
    });
    let nextSortOrder = (last?.sortOrder ?? -1) + 1;

    const created: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const homework of homeworks) {
        const slug = await generateUniqueSlug(slugify(homework.title), async (candidate) =>
          Boolean(
            await tx.homework.findFirst({ where: { lessonId, slug: candidate }, select: { id: true } })
          )
        );

        const isCode = homework.type === "CODE";
        const row = await tx.homework.create({
          data: {
            lessonId,
            slug,
            title: homework.title,
            description: homework.description,
            type: homework.type,
            language: isCode ? (homework.language ?? "PYTHON") : null,
            starterCode: isCode ? homework.starterCode : null,
            solutionCode: isCode ? homework.solutionCode : null,
            maxAttempts: homework.maxAttempts,
            timeLimitSec: homework.timeLimitSec,
            maxScore: homework.maxScore,
            passingScore: homework.passingScore,
            dueDate: homework.dueDate,
            allowLate: homework.allowLate,
            latePenalty: homework.latePenalty,
            sortOrder: nextSortOrder++,
            isPublished: false,
            requiresManualReview: homework.type === "FILE" ? true : homework.requiresManualReview,
            reviewInstructions: homework.reviewInstructions,
            ...(isCode && homework.testCases.length > 0
              ? {
                  testCases: {
                    create: homework.testCases.map((testCase, index) => ({
                      input: testCase.input,
                      expected: testCase.expected,
                      isHidden: testCase.isHidden,
                      points: testCase.points,
                      description: testCase.description,
                      sortOrder: index,
                    })),
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        created.push(row.id);
      }
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Homework",
      entityId: lessonId,
      action: "CREATE",
      metadata: { imported: created.length, lessonId },
    });

    return { count: created.length };
  }

  private parse(content: string): NormalizedHomework[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new BadRequestException("invalidHomeworkImportPayload");
    }

    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { homeworks?: unknown }).homeworks)
        ? (parsed as { homeworks: unknown[] }).homeworks
        : parsed && typeof parsed === "object" && "title" in parsed
          ? [parsed]
          : null;

    if (!list) throw new BadRequestException("invalidHomeworkImportPayload");

    return (list as ImportedHomework[])
      .map((raw) => this.normalize(raw))
      .filter((homework) => homework.title.length > 0);
  }

  private normalize(raw: ImportedHomework): NormalizedHomework {
    const requested = HOMEWORK_TYPES.has(raw.type ?? "") ? (raw.type as HomeworkType) : "CODE";
    const type: HomeworkType = requested === "CODE" && !CODE_HOMEWORK_ENABLED ? "FILE" : requested;

    const language: Language | null = LANGUAGES.includes(raw.language as Language)
      ? (raw.language as Language)
      : type === "CODE"
        ? "PYTHON"
        : null;

    const dueDate = raw.dueDate ? new Date(raw.dueDate) : null;

    return {
      title: String(raw.title ?? "").trim(),
      description: String(raw.description ?? "").trim(),
      type,
      language,
      starterCode: raw.starterCode ?? null,
      solutionCode: raw.solutionCode ?? null,
      maxAttempts: clamp(Number(raw.maxAttempts) || 10, 1, 1000),
      timeLimitSec: clamp(Number(raw.timeLimitSec) || 5, 1, 120),
      maxScore: clamp(Number(raw.maxScore) || 100, 1, 1000),
      passingScore: clamp(Number(raw.passingScore) || 60, 1, 100),
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      allowLate: raw.allowLate ?? true,
      latePenalty: clamp(Number(raw.latePenalty) || 20, 0, 100),
      requiresManualReview: raw.requiresManualReview ?? type === "FILE",
      reviewInstructions: raw.reviewInstructions ?? null,
      testCases: Array.isArray(raw.testCases)
        ? raw.testCases.map((testCase) => ({
            input: String(testCase.input ?? ""),
            expected: String(testCase.expected ?? ""),
            isHidden: testCase.isHidden ?? false,
            points: clamp(Number(testCase.points) || 1, 1, 100),
            description: testCase.description ?? null,
          }))
        : [],
    };
  }

  private async manageableLesson(ability: AppAbility, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");

    const course = await this.prisma.course.findFirst({
      where: {
        AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course", "update"), { id: lesson.courseId }],
      },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("lessonNotFound");
    return lesson;
  }
}

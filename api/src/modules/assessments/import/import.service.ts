import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma";
import { accessibleWhere, type AppAbility } from "../../../common/policies/abilities";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  bufferToData,
  jsonToData,
  validateSpreadsheetData,
  type SpreadsheetData,
} from "../../../common/spreadsheet-utils";

/**
 * Импорт тестов и экзаменов из таблицы. Перенесено из
 * src/actions/import-actions.ts в web.
 */
@Injectable()
export class AssessmentImportService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Разбор присланного файла: JSON, CSV или XLSX. */
  parseFile(file: { originalname: string; buffer: Buffer }): SpreadsheetData {
    let data: SpreadsheetData;
    try {
      if (file.originalname.endsWith(".json")) {
        data = jsonToData(file.buffer.toString("utf8"));
      } else {
        const format = file.originalname.endsWith(".csv") ? ("csv" as const) : ("xlsx" as const);
        data = bufferToData(file.buffer, format);
      }
    } catch (error) {
      throw new BadRequestException(
        `fileReadError: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

    const errors = validateSpreadsheetData(data);
    if (errors.length > 0) throw new BadRequestException(errors.join("; "));
    return data;
  }

  private questionsInput(data: SpreadsheetData): Prisma.AssessmentQuestionCreateWithoutAssessmentInput[] {
    return data.questions.map((question, questionIndex) => ({
      text: question.text,
      type: question.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE",
      points: question.points,
      sortOrder: questionIndex,
      options: {
        create: question.options.map((option, optionIndex) => ({
          text: option.text,
          isCorrect: option.isCorrect,
          sortOrder: optionIndex,
        })),
      },
    }));
  }

  /** Тест урока: у урока может быть только один. */
  async importTest(lessonId: string, data: SpreadsheetData, ability: AppAbility) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");
    await this.manageableCourse(ability, lesson.courseId);

    const existing = await this.prisma.assessment.findUnique({ where: { lessonId }, select: { id: true } });
    if (existing) throw new ConflictException("lessonAlreadyHasTest");

    return this.prisma.assessment.create({
      data: {
        type: "TEST",
        title: data.title,
        passingScore: data.passingScore,
        timeLimitMin: data.timeLimitMin,
        maxAttempts: data.maxAttempts,
        // Импортированное не публикуется само: преподаватель сначала смотрит
        isPublished: false,
        courseId: lesson.courseId,
        lessonId,
        questions: { create: this.questionsInput(data) },
      },
      include: { _count: { select: { questions: true } } },
    });
  }

  /** Экзамен курса: их может быть несколько. */
  async importExam(courseId: string, data: SpreadsheetData, ability: AppAbility) {
    await this.manageableCourse(ability, courseId);

    const maxSort = await this.prisma.assessment.aggregate({
      where: { courseId, type: "EXAM" },
      _max: { sortOrder: true },
    });

    return this.prisma.assessment.create({
      data: {
        type: "EXAM",
        title: data.title,
        description: data.description ?? undefined,
        passingScore: data.passingScore,
        timeLimitMin: data.timeLimitMin,
        maxAttempts: data.maxAttempts,
        isPublished: false,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        courseId,
        questions: { create: this.questionsInput(data) },
      },
      include: { _count: { select: { questions: true } } },
    });
  }

  private async manageableCourse(ability: AppAbility, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course", "update"), { id: courseId }] },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    return course;
  }
}

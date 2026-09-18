import { Injectable, NotFoundException } from "@nestjs/common";
import * as XLSX from "@e965/xlsx";
import type { Prisma } from "../../../../generated/prisma";
import { accessibleWhere, type AppAbility } from "../../../common/policies/abilities";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  dataToCSVString,
  dataToJSONString,
  dataToWorkbook,
  type SpreadsheetData,
} from "../../../common/spreadsheet-utils";

export type ExportFormat = "xlsx" | "csv" | "json";

export interface ExportedFile {
  body: string | Buffer;
  contentType: string;
  filename: string;
}

/** Выгрузка теста или экзамена в таблицу. Перенесено из v1/export/* в web. */
@Injectable()
export class AssessmentExportService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async exportTest(lessonId: string, format: ExportFormat, ability: AppAbility) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { lessonId },
      include: {
        lesson: { select: { courseId: true } },
        questions: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!assessment?.lesson) throw new NotFoundException("testNotFound");
    await this.manageableCourse(ability, assessment.lesson.courseId);

    return this.render(assessment, format, "test");
  }

  async exportExam(examId: string, format: ExportFormat, ability: AppAbility) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: examId },
      include: {
        questions: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!assessment) throw new NotFoundException("assessmentNotFound");
    await this.manageableCourse(ability, assessment.courseId);

    return this.render(assessment, format, "exam");
  }

  private render(
    assessment: {
      title: string;
      description: string | null;
      passingScore: number;
      timeLimitMin: number | null;
      maxAttempts: number;
      questions: {
        text: string;
        type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
        points: number;
        options: { text: string; isCorrect: boolean }[];
      }[];
    },
    format: ExportFormat,
    prefix: string
  ): ExportedFile {
    const data: SpreadsheetData = {
      title: assessment.title,
      passingScore: assessment.passingScore,
      timeLimitMin: assessment.timeLimitMin,
      maxAttempts: assessment.maxAttempts,
      description: assessment.description,
      questions: assessment.questions.map((question) => ({
        text: question.text,
        type: question.type,
        points: question.points,
        options: question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
      })),
    };

    const name = `${prefix}-${assessment.title.replace(/\s+/g, "_")}`;

    if (format === "json") {
      return {
        body: dataToJSONString(data),
        contentType: "application/json; charset=utf-8",
        filename: `${name}.json`,
      };
    }
    if (format === "csv") {
      return {
        body: dataToCSVString(data),
        contentType: "text/csv; charset=utf-8",
        filename: `${name}.csv`,
      };
    }

    const workbook = dataToWorkbook(data);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return {
      body: buffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${name}.xlsx`,
    };
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

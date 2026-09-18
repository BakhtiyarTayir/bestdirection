import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentAbility } from "../../../common/auth/decorators";
import type { AppAbility } from "../../../common/policies/abilities";
import { CheckPolicies } from "../../../common/policies/check-policies.decorator";
import { AssessmentExportService, type ExportFormat } from "./assessment-export.service";
import { AssessmentImportService } from "./import.service";

// Таблица с вопросами: файлы маленькие, поэтому читаем в память
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

class FormatQueryDto extends createZodDto(
  z.object({ format: z.enum(["xlsx", "csv", "json"]).default("xlsx") })
) {}

interface UploadedSpreadsheet {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Controller("assessments")
export class AssessmentImportController {
  constructor(
    private readonly importService: AssessmentImportService,
    private readonly exportService: AssessmentExportService
  ) {}

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Post("import/test/:lessonId")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_SIZE } }))
  async importTest(
    @Param("lessonId") lessonId: string,
    @UploadedFile() file: UploadedSpreadsheet | undefined,
    @CurrentAbility() ability: AppAbility
  ) {
    const data = this.importService.parseFile(this.require(file));
    const assessment = await this.importService.importTest(lessonId, data, ability);
    return { id: assessment.id, title: assessment.title, questions: assessment._count.questions };
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Post("import/exam/:courseId")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_SIZE } }))
  async importExam(
    @Param("courseId") courseId: string,
    @UploadedFile() file: UploadedSpreadsheet | undefined,
    @CurrentAbility() ability: AppAbility
  ) {
    const data = this.importService.parseFile(this.require(file));
    const assessment = await this.importService.importExam(courseId, data, ability);
    return { id: assessment.id, title: assessment.title, questions: assessment._count.questions };
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Get("export/test/:lessonId")
  async exportTest(
    @Param("lessonId") lessonId: string,
    @Query() query: FormatQueryDto,
    @CurrentAbility() ability: AppAbility,
    @Res() res: Response
  ) {
    const file = await this.exportService.exportTest(lessonId, query.format as ExportFormat, ability);
    this.sendFile(res, file);
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Get("export/exam/:examId")
  async exportExam(
    @Param("examId") examId: string,
    @Query() query: FormatQueryDto,
    @CurrentAbility() ability: AppAbility,
    @Res() res: Response
  ) {
    const file = await this.exportService.exportExam(examId, query.format as ExportFormat, ability);
    this.sendFile(res, file);
  }

  private require(file: UploadedSpreadsheet | undefined): UploadedSpreadsheet {
    if (!file) throw new BadRequestException("fileRequired");
    return file;
  }

  private sendFile(res: Response, file: { body: string | Buffer; contentType: string; filename: string }) {
    // Имя файла кириллицей: filename* по RFC 5987, как в выдаче работ студентов
    res
      .status(200)
      .setHeader("Content-Type", file.contentType)
      .setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`
      )
      .send(file.body);
  }
}

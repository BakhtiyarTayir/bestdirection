import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { HomeworkTransferService } from "./homework-transfer.service";

// Задания выгружаются и загружаются в JSON: файл небольшой, читаем в память
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

interface UploadedJson {
  originalname: string;
  buffer: Buffer;
}

@Controller("homework")
export class HomeworkTransferController {
  constructor(private readonly transfer: HomeworkTransferService) {}

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Get("export/:lessonId")
  async export(
    @Param("lessonId") lessonId: string,
    @CurrentAbility() ability: AppAbility,
    @Res() response: Response
  ) {
    const { filename, payload } = await this.transfer.export(lessonId, ability);
    response
      .set({
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      })
      .send(JSON.stringify(payload, null, 2));
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Post("import/:lessonId")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_SIZE } }))
  import(
    @Param("lessonId") lessonId: string,
    @UploadedFile() file: UploadedJson | undefined,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    if (!file) throw new BadRequestException("fileRequired");
    if (!file.originalname.toLowerCase().endsWith(".json")) {
      throw new BadRequestException("invalidHomeworkImportFormat");
    }
    return this.transfer.import(lessonId, file.buffer.toString("utf-8"), ability, actor);
  }
}

import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { FilesService } from "./files.service";

/** Выдача файлов работ. Перенесено из src/app/api/files/[fileId]/* в web. */
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Authenticated()
  @Get(":id")
  async open(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
    @Res() response: Response
  ) {
    const file = await this.files.open(id, user, { download: false });
    response.set(file.headers);
    file.stream.pipe(response);
  }

  /** Тот же файл, но всегда вложением. */
  @Authenticated()
  @Get(":id/download")
  async download(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
    @Res() response: Response
  ) {
    const file = await this.files.open(id, user, { download: true });
    response.set(file.headers);
    file.stream.pipe(response);
  }
}

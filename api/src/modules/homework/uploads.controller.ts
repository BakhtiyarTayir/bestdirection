import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { unlink } from "node:fs/promises";
import { extname } from "node:path";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import {
  diskStorageIn,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  UploadsService,
  VIDEO_EXTENSIONS,
} from "./uploads.service";

interface UploadedDiskFile {
  originalname: string;
  filename: string;
  path: string;
  size: number;
}

/**
 * Загрузка картинок и видео. Перенесено из src/app/api/v1/upload/* в web.
 * Оба файла пишутся на диск потоком: в память процесса не попадают.
 */
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Post("image")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorageIn("images"),
      limits: { fileSize: MAX_IMAGE_SIZE },
    })
  )
  async image(@UploadedFile() file: UploadedDiskFile | undefined) {
    await this.ensureExtension(file, IMAGE_EXTENSIONS);
    return { url: this.uploads.publicUrl("images", file!.filename) };
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Post("video")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorageIn("videos"),
      limits: { fileSize: MAX_VIDEO_SIZE },
    })
  )
  async video(@UploadedFile() file: UploadedDiskFile | undefined) {
    await this.ensureExtension(file, VIDEO_EXTENSIONS);
    return { url: this.uploads.publicUrl("videos", file!.filename) };
  }

  /**
   * Расширение проверяется после записи: имя приходит из запроса, а файл уже
   * на диске. Неподходящий удаляем сразу, чтобы не копить мусор.
   */
  private async ensureExtension(file: UploadedDiskFile | undefined, allowed: Set<string>) {
    if (!file) throw new BadRequestException("fileRequired");
    if (!allowed.has(extname(file.originalname).toLowerCase())) {
      await unlink(file.path).catch(() => {});
      throw new BadRequestException("fileTypeNotAllowed");
    }
  }
}

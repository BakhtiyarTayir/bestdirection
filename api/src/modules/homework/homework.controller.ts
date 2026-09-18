import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { extname } from "node:path";
import { unlink } from "node:fs/promises";
import { Authenticated, CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { CreateHomeworkDto, LessonQueryDto, UpdateHomeworkDto } from "./dto/homework.dto";
import { SubmitSolutionDto } from "./dto/submission.dto";
import { HomeworkService } from "./homework.service";
import { SubmissionsService } from "./submissions.service";
import { diskStorageIn, MAX_SUBMISSION_SIZE, SUBMISSION_EXTENSIONS } from "./uploads.service";

interface UploadedDiskFile {
  originalname: string;
  path: string;
  size: number;
}

@Controller("homework")
export class HomeworkController {
  constructor(
    private readonly homework: HomeworkService,
    private readonly submissions: SubmissionsService
  ) {}

  @Authenticated()
  @Get()
  list(@Query() query: LessonQueryDto, @CurrentAbility() ability: AppAbility) {
    return this.homework.list(query.lessonId, ability);
  }

  /** Задания ученика по всем его курсам. */
  @Authenticated()
  @Get("my")
  my(@CurrentUser() user: SessionUser) {
    return this.homework.forStudentList(user);
  }

  /** Счётчик в шапке: своё значение ученику и персоналу. */
  @Authenticated()
  @Get("counts")
  counts(@CurrentUser() user: SessionUser) {
    return this.submissions.counts(user);
  }

  /** Свои лучшие результаты по заданиям урока. */
  @Authenticated()
  @Get("my/best")
  myBest(@Query() query: LessonQueryDto, @CurrentUser() user: SessionUser) {
    return this.homework.myBestByLesson(query.lessonId, user);
  }

  @Authenticated()
  @Get(":id/student")
  forStudent(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.homework.forStudent(id, user);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Get(":id")
  forTeacher(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.homework.forTeacher(id, ability);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Get(":id/submissions")
  submissionsOf(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.submissions.byHomework(id, ability);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Post()
  create(
    @Body() body: CreateHomeworkDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.homework.create(body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateHomeworkDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.homework.update(id, body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Post(":id/publish")
  togglePublished(
    @Param("id") id: string,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.homework.togglePublished(id, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    await this.homework.remove(id, ability, actor);
    return { ok: true };
  }

  /** Сдача текстом. */
  @Authenticated()
  @Post(":id/submissions")
  submit(
    @Param("id") id: string,
    @Body() body: SubmitSolutionDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.submissions.submitText(id, body.code, user);
  }

  /**
   * Сдача файлом. Файл пишется на диск потоком: в память процесса он не
   * попадает. Расширение проверяется после записи — имя файла известно только
   * из запроса, и отклонённый файл сразу удаляется.
   */
  @Authenticated()
  @Post(":id/submissions/file")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorageIn("homework"),
      limits: { fileSize: MAX_SUBMISSION_SIZE },
    })
  )
  async submitFile(
    @Param("id") id: string,
    @UploadedFile() file: UploadedDiskFile | undefined,
    @CurrentUser() user: SessionUser
  ) {
    if (!file) throw new BadRequestException("fileRequired");

    if (!SUBMISSION_EXTENSIONS.has(extname(file.originalname).toLowerCase())) {
      await unlink(file.path).catch(() => {});
      throw new BadRequestException("fileTypeNotAllowed");
    }

    const submission = await this.submissions.submitFile(id, file, user);
    return {
      submissionId: submission.id,
      attemptNumber: submission.attemptNumber,
      files: submission.files,
    };
  }
}

import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../../common/auth/decorators";
import { PublicContentService } from "./public.service";

/**
 * Страницы уроков и заданий для гостя. Перенесено из
 * src/app/[locale]/(public)/lessons|homework/open/... в web.
 *
 * Решение владельца от 2026-09-17: гостю открыты только бесплатные курсы,
 * платные ведут на вход. Раньше проверялся лишь признак публикации, и урок
 * платного курса читался без регистрации (аудит 2.9).
 */
@Controller("public")
export class PublicContentController {
  constructor(private readonly content: PublicContentService) {}

  @Public()
  @Get("lessons/:courseSlug/:lessonSlug")
  lesson(@Param("courseSlug") courseSlug: string, @Param("lessonSlug") lessonSlug: string) {
    return this.content.lesson(courseSlug, lessonSlug);
  }

  @Public()
  @Get("homework/:courseSlug/:lessonSlug/:homeworkSlug")
  homework(
    @Param("courseSlug") courseSlug: string,
    @Param("lessonSlug") lessonSlug: string,
    @Param("homeworkSlug") homeworkSlug: string
  ) {
    return this.content.homework(courseSlug, lessonSlug, homeworkSlug);
  }
}

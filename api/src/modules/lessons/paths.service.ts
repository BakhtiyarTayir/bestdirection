import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Адреса кабинета построены на slug: /courses/<курс>/lessons/<урок>/homework/<задание>.
 * Перенесено из src/lib/slug-resolvers.ts в web.
 *
 * Разрешение идёт сразу по правам вызывающего: чужой курс, черновик урока и
 * неопубликованное задание для ученика не существуют — как и несуществующий
 * адрес. Раньше slug превращался в id прямым запросом к базе без проверок, а
 * права смотрела уже сама страница.
 */
@Injectable()
export class PathsService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async resolve(
    params: { courseSlug: string; lessonSlug?: string; homeworkSlug?: string },
    ability: AppAbility
  ) {
    const course = await this.prisma.course.findFirst({
      where: {
        AND: [
          accessibleWhere<Prisma.CourseWhereInput>(ability, "Course"),
          { slug: params.courseSlug },
        ],
      },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    if (!params.lessonSlug) return { courseId: course.id };

    // Черновики видит только персонал — то же правило, что и в самих уроках
    const canSeeDrafts = ability.can("read", "UnpublishedContent");
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        courseId: course.id,
        slug: params.lessonSlug,
        ...(canSeeDrafts ? {} : { isPublished: true }),
      },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");
    if (!params.homeworkSlug) return { courseId: course.id, lessonId: lesson.id };

    const homework = await this.prisma.homework.findFirst({
      where: {
        lessonId: lesson.id,
        slug: params.homeworkSlug,
        ...(canSeeDrafts ? {} : { isPublished: true }),
      },
      select: { id: true },
    });
    if (!homework) throw new NotFoundException("homeworkNotFound");

    return { courseId: course.id, lessonId: lesson.id, homeworkId: homework.id };
  }
}

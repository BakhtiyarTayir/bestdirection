import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/** Что видно гостю: только опубликованное в опубликованном бесплатном курсе. */
const FREE_COURSE = { isPublished: true, accessType: "FREE" } as const;

@Injectable()
export class PublicContentService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async lesson(courseSlug: string, lessonSlug: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        slug: lessonSlug,
        isPublished: true,
        course: { slug: courseSlug, ...FREE_COURSE },
      },
      select: {
        id: true,
        title: true,
        content: true,
        contentFormat: true,
        courseId: true,
        course: { select: { title: true } },
        homeworks: {
          where: { isPublished: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, slug: true, title: true, language: true, passingScore: true },
        },
      },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");

    // Соседние уроки для перехода вперёд и назад
    const siblings = await this.prisma.lesson.findMany({
      where: { courseId: lesson.courseId, isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, slug: true, title: true },
    });

    return { lesson, siblings };
  }

  async homework(courseSlug: string, lessonSlug: string, homeworkSlug: string) {
    const homework = await this.prisma.homework.findFirst({
      where: {
        slug: homeworkSlug,
        isPublished: true,
        lesson: {
          slug: lessonSlug,
          isPublished: true,
          course: { slug: courseSlug, ...FREE_COURSE },
        },
      },
      select: {
        title: true,
        description: true,
        type: true,
        language: true,
        passingScore: true,
        maxAttempts: true,
        timeLimitSec: true,
        // Скрытые проверки гостю тем более не показываем (аудит 3.5)
        testCases: {
          where: { isHidden: false },
          orderBy: { sortOrder: "asc" },
          select: { id: true, input: true, expected: true, description: true },
        },
      },
    });
    if (!homework) throw new NotFoundException("homeworkNotFound");
    return homework;
  }
}

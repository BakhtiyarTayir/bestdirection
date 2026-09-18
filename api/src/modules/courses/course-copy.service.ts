import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { generateUniqueSlug, slugify } from "../../common/slugify";

/**
 * Копирование курса целиком: уроки, тесты уроков, экзамены курса, вопросы и
 * варианты ответов. Перенесено из src/actions/course-copy-actions.ts в web.
 */
@Injectable()
export class CourseCopyService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async copy(sourceCourseId: string, actor: SessionUser, options: { newTitle?: string } = {}) {
    const source = await this.prisma.course.findUnique({
      where: { id: sourceCourseId },
      include: {
        lessons: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" },
          include: {
            assessment: {
              include: {
                questions: {
                  orderBy: { sortOrder: "asc" },
                  include: { options: { orderBy: { sortOrder: "asc" } } },
                },
              },
            },
          },
        },
        assessments: {
          where: { lessonId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            questions: {
              orderBy: { sortOrder: "asc" },
              include: { options: { orderBy: { sortOrder: "asc" } } },
            },
          },
        },
      },
    });

    if (!source) throw new NotFoundException("courseNotFound");

    // Копировать можно опубликованный курс, шаблон или свой собственный
    const canCopy = source.isPublished || source.isTemplate || source.teacherId === actor.id;
    if (!canCopy) throw new ForbiddenException("noAccess");

    const courseTitle = options.newTitle ?? `${source.title} (copy)`;
    const courseSlug = await generateUniqueSlug(slugify(courseTitle), async (candidate) =>
      Boolean(
        // Без фильтра мягкого удаления: slug держит и удалённый курс
        await this.prismaService.prismaUnscoped.course.findUnique({
          where: { slug: candidate },
          select: { id: true },
        })
      )
    );

    const newCourse = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          title: courseTitle,
          slug: courseSlug,
          description: source.description,
          coverImage: source.coverImage,
          isPublished: false,
          isTemplate: false,
          sortOrder: 0,
          teacherId: actor.id,
          copiedFromId: source.id,
          copiedAt: new Date(),
        },
      });

      const usedLessonSlugs = new Set<string>();
      for (const lesson of source.lessons) {
        let lessonSlug = slugify(lesson.title);
        let counter = 0;
        while (usedLessonSlugs.has(lessonSlug)) {
          counter++;
          lessonSlug = `${slugify(lesson.title)}-${counter}`;
        }
        usedLessonSlugs.add(lessonSlug);

        const newLesson = await tx.lesson.create({
          data: {
            title: lesson.title,
            slug: lessonSlug,
            content: lesson.content,
            videoUrl: lesson.videoUrl,
            videoSource: lesson.videoSource,
            sortOrder: lesson.sortOrder,
            isPublished: lesson.isPublished,
            courseId: course.id,
          },
        });

        if (lesson.assessment) {
          const newAssessment = await tx.assessment.create({
            data: {
              type: lesson.assessment.type,
              title: lesson.assessment.title,
              description: lesson.assessment.description,
              passingScore: lesson.assessment.passingScore,
              timeLimitMin: lesson.assessment.timeLimitMin,
              maxAttempts: lesson.assessment.maxAttempts,
              sortOrder: lesson.assessment.sortOrder,
              isPublished: lesson.assessment.isPublished,
              courseId: course.id,
              lessonId: newLesson.id,
            },
          });

          for (const question of lesson.assessment.questions) {
            await tx.assessmentQuestion.create({
              data: {
                text: question.text,
                type: question.type,
                points: question.points,
                sortOrder: question.sortOrder,
                assessmentId: newAssessment.id,
                options: {
                  create: question.options.map((option) => ({
                    text: option.text,
                    isCorrect: option.isCorrect,
                    sortOrder: option.sortOrder,
                  })),
                },
              },
            });
          }
        }
      }

      for (const exam of source.assessments) {
        const newExam = await tx.assessment.create({
          data: {
            type: exam.type,
            title: exam.title,
            description: exam.description,
            passingScore: exam.passingScore,
            timeLimitMin: exam.timeLimitMin,
            maxAttempts: exam.maxAttempts,
            sortOrder: exam.sortOrder,
            isPublished: exam.isPublished,
            courseId: course.id,
          },
        });

        for (const question of exam.questions) {
          await tx.assessmentQuestion.create({
            data: {
              text: question.text,
              type: question.type,
              points: question.points,
              sortOrder: question.sortOrder,
              assessmentId: newExam.id,
              options: {
                create: question.options.map((option) => ({
                  text: option.text,
                  isCorrect: option.isCorrect,
                  sortOrder: option.sortOrder,
                })),
              },
            },
          });
        }
      }

      return course;
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Course",
      entityId: newCourse.id,
      action: "CREATE",
      metadata: { title: newCourse.title, copiedFrom: source.title, copiedFromId: source.id },
    });

    return { id: newCourse.id, title: newCourse.title, slug: newCourse.slug };
  }

  /** Каталог для копирования: шаблоны и опубликованные курсы. */
  coursesForCopy() {
    return this.prisma.course.findMany({
      where: { OR: [{ isTemplate: true }, { isPublished: true }] },
      select: {
        id: true,
        title: true,
        description: true,
        coverImage: true,
        isTemplate: true,
        createdAt: true,
        teacher: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { lessons: true, assessments: true, copies: true } },
      },
      orderBy: [{ isTemplate: "desc" }, { createdAt: "desc" }],
    });
  }

  /** Откуда курс скопирован и что скопировано с него. */
  async lineage(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        copiedAt: true,
        teacher: { select: { firstName: true, lastName: true } },
        copiedFrom: {
          select: {
            id: true,
            title: true,
            copiedAt: true,
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
        copies: {
          select: {
            id: true,
            title: true,
            copiedAt: true,
            teacher: { select: { firstName: true, lastName: true } },
          },
          orderBy: { copiedAt: "desc" },
        },
      },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    return course;
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import { generateUniqueSlug, slugify } from "../../common/slugify";
import type { CreateLessonDto, UpdateLessonDto } from "./dto/lesson.dto";

/** Перенесено из src/actions/lesson-actions.ts в web. */
@Injectable()
export class LessonsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Черновики видит только персонал: раньше это был if по роли STUDENT, из-за
   *  чего неопубликованные уроки доставались и родителю (аудит 2.4). */
  private visibilityWhere(ability: AppAbility): Prisma.LessonWhereInput {
    return ability.can("read", "UnpublishedContent") ? {} : { isPublished: true };
  }

  list(courseId: string, ability: AppAbility) {
    return this.prisma.lesson.findMany({
      where: { courseId, ...this.visibilityWhere(ability) },
      include: { assessment: { select: { id: true, title: true, isPublished: true } } },
      orderBy: { sortOrder: "asc" },
    });
  }

  /** Список уроков курса для левой колонки на странице урока. */
  async courseNav(courseSlug: string, ability: AppAbility, user: SessionUser) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course"), { slug: courseSlug }] },
      select: { id: true, title: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");

    const lessons = await this.prisma.lesson.findMany({
      where: { courseId: course.id, ...this.visibilityWhere(ability) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, slug: true, title: true, isPublished: true, videoUrl: true, sortOrder: true },
    });

    let completedIds: string[] = [];
    if (user.role === "STUDENT" && lessons.length > 0) {
      const progress = await this.prisma.lessonProgress.findMany({
        where: {
          studentId: user.id,
          lessonId: { in: lessons.map((lesson) => lesson.id) },
          completedAt: { not: null },
        },
        select: { lessonId: true },
      });
      completedIds = progress.map((item) => item.lessonId);
    }

    return { courseTitle: course.title, lessons, completedIds };
  }

  async byId(id: string, ability: AppAbility) {
    const canSeeDrafts = ability.can("read", "UnpublishedContent");
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, ...this.visibilityWhere(ability) },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        assessment: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            timeLimitMin: true,
            maxAttempts: true,
            isPublished: true,
          },
        },
        homeworks: {
          where: canSeeDrafts ? {} : { isPublished: true },
          select: {
            id: true,
            slug: true,
            title: true,
            language: true,
            isPublished: true,
            passingScore: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");
    return lesson;
  }

  /** slug урока → id: адреса кабинета построены на slug. */
  async idBySlug(courseId: string, lessonSlug: string, ability: AppAbility) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { courseId, slug: lessonSlug, ...this.visibilityWhere(ability) },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");
    return lesson;
  }

  async create(data: CreateLessonDto, ability: AppAbility, actor: SessionUser) {
    await this.manageableCourse(ability, data.courseId);

    const slug = await generateUniqueSlug(slugify(data.title), async (candidate) =>
      Boolean(
        // Без фильтра мягкого удаления: пару (courseId, slug) держит занятой и
        // удалённый урок — уникальный индекс про deletedAt не знает
        await this.prismaService.prismaUnscoped.lesson.findFirst({
          where: { courseId: data.courseId, slug: candidate },
          select: { id: true },
        })
      )
    );

    const lesson = await this.prisma.lesson.create({
      data: {
        title: data.title,
        slug,
        content: data.content,
        ...(data.contentFormat !== undefined && { contentFormat: data.contentFormat }),
        videoUrl: data.videoUrl,
        videoSource: data.videoSource,
        sortOrder: data.sortOrder,
        isPublished: data.isPublished,
        courseId: data.courseId,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Lesson",
      entityId: lesson.id,
      action: "CREATE",
      metadata: { title: lesson.title, courseId: data.courseId },
    });
    return lesson;
  }

  async update(id: string, data: UpdateLessonDto, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageableLesson(ability, id);

    let slugUpdate: { slug: string } | Record<string, never> = {};
    if (data.title !== undefined && data.title !== existing.title) {
      const newSlug = await generateUniqueSlug(slugify(data.title), async (candidate) => {
        const found = await this.prismaService.prismaUnscoped.lesson.findFirst({
          where: { courseId: existing.courseId, slug: candidate },
          select: { id: true },
        });
        return Boolean(found) && found!.id !== id;
      });
      slugUpdate = { slug: newSlug };
    }

    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...slugUpdate,
        ...(data.content !== undefined && { content: data.content }),
        ...(data.contentFormat !== undefined && { contentFormat: data.contentFormat }),
        ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
        ...(data.videoSource !== undefined && { videoSource: data.videoSource }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
      },
    });

    const changes = computeChanges(
      { title: existing.title, isPublished: existing.isPublished, sortOrder: existing.sortOrder },
      { ...data }
    );
    if (changes) {
      await this.audit.record({
        userId: actor.id,
        entityType: "Lesson",
        entityId: id,
        action: "UPDATE",
        changes,
      });
    }
    return lesson;
  }

  /** Мягкое удаление: урок уходит в Корзину вместе с тестом и заданиями. */
  async remove(id: string, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageableLesson(ability, id);

    await this.prisma.lesson.delete({ where: { id } });

    await this.audit.record({
      userId: actor.id,
      entityType: "Lesson",
      entityId: id,
      action: "DELETE",
      metadata: { title: existing.title, courseId: existing.courseId },
    });
  }

  private async manageableCourse(ability: AppAbility, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course", "update"), { id: courseId }] },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    return course;
  }

  /** Урок, курсом которого вызывающий вправе управлять. Чужой — 404. */
  private async manageableLesson(ability: AppAbility, id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: { id: true, title: true, courseId: true, isPublished: true, sortOrder: true },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");
    await this.manageableCourse(ability, lesson.courseId);
    return lesson;
  }
}

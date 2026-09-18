import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import { generateUniqueSlug, slugify } from "../../common/slugify";
import type { CreateHomeworkDto, UpdateHomeworkDto } from "./dto/homework.dto";

/** Перенесено из src/actions/homework-actions.ts в web. */
@Injectable()
export class HomeworkService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Черновики видит только персонал — как в уроках и тестах (аудит 2.4). */
  private visibilityWhere(ability: AppAbility): Prisma.HomeworkWhereInput {
    return ability.can("read", "UnpublishedContent") ? {} : { isPublished: true };
  }

  list(lessonId: string, ability: AppAbility) {
    return this.prisma.homework.findMany({
      where: { lessonId, ...this.visibilityWhere(ability) },
      include: { _count: { select: { testCases: true, submissions: true } } },
      orderBy: { sortOrder: "asc" },
    });
  }

  async create(data: CreateHomeworkDto, ability: AppAbility, actor: SessionUser) {
    const lesson = await this.manageableLesson(ability, data.lessonId);

    const type = data.type ?? "FILE";
    const isFile = type === "FILE";

    const slug = await generateUniqueSlug(slugify(data.title), async (candidate) =>
      Boolean(
        await this.prisma.homework.findFirst({
          where: { lessonId: data.lessonId, slug: candidate },
          select: { id: true },
        })
      )
    );

    const homework = await this.prisma.homework.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        type,
        language: isFile ? null : (data.language ?? null),
        starterCode: isFile ? null : data.starterCode,
        solutionCode: isFile ? null : data.solutionCode,
        maxAttempts: data.maxAttempts ?? 10,
        timeLimitSec: isFile ? 5 : (data.timeLimitSec ?? 5),
        passingScore: data.passingScore ?? 60,
        dueDate: data.dueDate ?? null,
        allowLate: data.allowLate ?? true,
        latePenalty: data.latePenalty ?? 20,
        // Файловую работу всегда проверяет человек: автотестов у неё нет
        requiresManualReview: isFile,
        isPublished: data.isPublished ?? false,
        lessonId: data.lessonId,
        ...(!isFile && data.testCases
          ? {
              testCases: {
                create: data.testCases.map((testCase, index) => ({
                  input: testCase.input,
                  expected: testCase.expected,
                  isHidden: testCase.isHidden ?? false,
                  points: testCase.points ?? 1,
                  description: testCase.description ?? null,
                  sortOrder: index,
                })),
              },
            }
          : {}),
      },
      include: { testCases: true },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Homework",
      entityId: homework.id,
      action: "CREATE",
      metadata: { title: homework.title, lessonId: lesson.id },
    });
    return homework;
  }

  async update(id: string, data: UpdateHomeworkDto, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageableHomework(ability, id);

    let slugUpdate: { slug: string } | Record<string, never> = {};
    if (data.title !== undefined && data.title !== existing.title) {
      const newSlug = await generateUniqueSlug(slugify(data.title), async (candidate) => {
        const found = await this.prisma.homework.findFirst({
          where: { lessonId: existing.lessonId, slug: candidate },
          select: { id: true },
        });
        return Boolean(found) && found!.id !== id;
      });
      slugUpdate = { slug: newSlug };
    }

    const isFile = data.type === "FILE";

    const homework = await this.prisma.$transaction(async (tx) => {
      if (isFile) {
        // Переключили на файловое — автотесты больше не нужны
        await tx.testCase.deleteMany({ where: { homeworkId: id } });
      } else if (data.testCases) {
        await tx.testCase.deleteMany({ where: { homeworkId: id } });
        await tx.testCase.createMany({
          data: data.testCases.map((testCase, index) => ({
            homeworkId: id,
            input: testCase.input,
            expected: testCase.expected,
            isHidden: testCase.isHidden ?? false,
            points: testCase.points ?? 1,
            description: testCase.description ?? null,
            sortOrder: index,
          })),
        });
      }

      return tx.homework.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...slugUpdate,
          ...(data.description !== undefined && { description: data.description }),
          ...(data.type !== undefined && { type: data.type }),
          ...(isFile
            ? { language: null, starterCode: null, solutionCode: null, requiresManualReview: true }
            : {
                ...(data.language !== undefined && { language: data.language }),
                ...(data.starterCode !== undefined && { starterCode: data.starterCode }),
                ...(data.solutionCode !== undefined && { solutionCode: data.solutionCode }),
              }),
          ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
          ...(data.timeLimitSec !== undefined && { timeLimitSec: data.timeLimitSec }),
          ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
          ...(data.dueDate !== undefined && { dueDate: data.dueDate ?? null }),
          ...(data.allowLate !== undefined && { allowLate: data.allowLate }),
          ...(data.latePenalty !== undefined && { latePenalty: data.latePenalty }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        },
        include: { testCases: { orderBy: { sortOrder: "asc" } } },
      });
    });

    const changes = computeChanges(
      {
        title: existing.title,
        passingScore: existing.passingScore,
        isPublished: existing.isPublished,
      },
      { ...data }
    );
    if (changes) {
      await this.audit.record({
        userId: actor.id,
        entityType: "Homework",
        entityId: id,
        action: "UPDATE",
        changes,
      });
    }
    return homework;
  }

  async remove(id: string, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageableHomework(ability, id);

    await this.prisma.homework.delete({ where: { id } });

    await this.audit.record({
      userId: actor.id,
      entityType: "Homework",
      entityId: id,
      action: "DELETE",
      metadata: { title: existing.title, lessonId: existing.lessonId },
    });
  }

  async togglePublished(id: string, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageableHomework(ability, id);

    const homework = await this.prisma.homework.update({
      where: { id },
      data: { isPublished: !existing.isPublished },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Homework",
      entityId: id,
      action: "UPDATE",
      changes: computeChanges(
        { isPublished: existing.isPublished },
        { isPublished: homework.isPublished }
      ),
    });
    return homework;
  }

  /** Задание преподавателю: целиком, вместе со скрытыми тест-кейсами. */
  async forTeacher(id: string, ability: AppAbility) {
    await this.manageableHomework(ability, id);

    const homework = await this.prisma.homework.findUnique({
      where: { id },
      include: {
        testCases: { orderBy: { sortOrder: "asc" } },
        lesson: {
          select: {
            id: true,
            title: true,
            courseId: true,
            course: { select: { id: true, title: true } },
          },
        },
        _count: { select: { submissions: true } },
      },
    });
    if (!homework) throw new NotFoundException("homeworkNotFound");
    return homework;
  }

  /**
   * Задание ученику: без скрытых тест-кейсов и без их данных в разборе своих
   * попыток. Раньше `testResults.testCase` приезжал вместе с `isHidden`,
   * `input` и `expected`, и после первой же сдачи ученик видел закрытые
   * проверки целиком (аудит 3.5).
   */
  async forStudent(id: string, user: SessionUser) {
    const homework = await this.prisma.homework.findFirst({
      where: { id, isPublished: true },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        type: true,
        language: true,
        starterCode: true,
        maxAttempts: true,
        timeLimitSec: true,
        passingScore: true,
        maxScore: true,
        dueDate: true,
        allowLate: true,
        latePenalty: true,
        requiresManualReview: true,
        lessonId: true,
        lesson: {
          select: {
            id: true,
            slug: true,
            title: true,
            courseId: true,
            course: { select: { id: true, slug: true, title: true } },
          },
        },
        testCases: {
          where: { isHidden: false },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            input: true,
            expected: true,
            points: true,
            description: true,
            sortOrder: true,
          },
        },
      },
    });
    if (!homework) throw new NotFoundException("homeworkNotFound");

    const submissions = await this.prisma.submission.findMany({
      where: { homeworkId: id, studentId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        files: { select: { id: true, filename: true, size: true } },
        testResults: {
          include: {
            testCase: {
              select: { id: true, isHidden: true, description: true, input: true, expected: true },
            },
          },
        },
      },
    });

    return {
      homework,
      submissions: submissions.map((submission) => ({
        ...submission,
        testResults: submission.testResults.map((result) =>
          result.testCase.isHidden
            ? {
                ...result,
                // Скрытая проверка: ученику остаётся только «прошла или нет»
                actualOutput: null,
                errorOutput: null,
                testCase: {
                  id: result.testCase.id,
                  isHidden: true,
                  description: null,
                  input: null,
                  expected: null,
                },
              }
            : result
        ),
      })),
      attemptsUsed: submissions.length,
      attemptsRemaining: homework.maxAttempts - submissions.length,
    };
  }

  /** Задания ученика по всем его курсам — страница «мои задания». */
  async forStudentList(user: SessionUser) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: user.id },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((enrollment) => enrollment.courseId);
    if (courseIds.length === 0) return [];

    return this.prisma.homework.findMany({
      where: {
        isPublished: true,
        lesson: { courseId: { in: courseIds }, isPublished: true },
      },
      include: {
        lesson: {
          select: {
            id: true,
            slug: true,
            title: true,
            course: { select: { id: true, slug: true, title: true } },
          },
        },
        submissions: {
          where: { studentId: user.id },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            manualStatus: true,
            percentage: true,
            attemptNumber: true,
            teacherComment: true,
            createdAt: true,
          },
        },
        _count: { select: { testCases: true } },
      },
      orderBy: [{ lesson: { course: { title: "asc" } } }, { dueDate: "asc" }],
    });
  }

  /**
   * Лучший результат ученика по каждому заданию урока — для плашек на
   * странице урока.
   */
  async myBestByLesson(lessonId: string, user: SessionUser) {
    const rows = await this.prisma.submission.groupBy({
      by: ["homeworkId"],
      where: { studentId: user.id, homework: { lessonId } },
      _max: { percentage: true },
    });

    return rows.map((row) => ({
      homeworkId: row.homeworkId,
      percentage: Math.round(row._max.percentage ?? 0),
    }));
  }

  /** Урок, курсом которого вызывающий вправе управлять. Чужой — 404. */
  private async manageableLesson(ability: AppAbility, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");

    const course = await this.prisma.course.findFirst({
      where: {
        AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course", "update"), { id: lesson.courseId }],
      },
      select: { id: true },
    });
    if (!course) throw new ForbiddenException("onlyOwnCourses");
    return lesson;
  }

  async manageableHomework(ability: AppAbility, id: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        lessonId: true,
        isPublished: true,
        passingScore: true,
        maxScore: true,
        type: true,
      },
    });
    if (!homework) throw new NotFoundException("homeworkNotFound");
    await this.manageableLesson(ability, homework.lessonId);
    return homework;
  }
}

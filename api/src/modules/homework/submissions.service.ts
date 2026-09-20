import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { unlink } from "node:fs/promises";
import type { Prisma } from "../../../generated/prisma";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { fileSubmissionPlaceholder } from "../../common/homework-file-placeholder";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import { submissionMimeType } from "../../common/submission-files";
import { activeEnrollmentFilter } from "../billing/billing-ledger.service";

/**
 * Перенесено из src/actions/homework-review-actions.ts, src/lib/homework-submission.ts
 * и src/app/api/homework/[homeworkId]/upload/route.ts в web.
 *
 * Автопроверка кода (Piston) не поднята — решение владельца от 2026-09-17,
 * поэтому сдача CODE-задания отклоняется, а не падает в ERROR.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Общая часть любой сдачи: задание опубликовано, ученик записан на курс,
   * срок не вышел, попытки не исчерпаны. Номер попытки берётся здесь, а
   * уникальный индекс на (homeworkId, studentId, attemptNumber) не даёт двум
   * параллельным сдачам занять один номер (аудит 3.4).
   */
  private async prepareAttempt(homeworkId: string, user: SessionUser) {
    if (user.role !== "STUDENT") throw new ForbiddenException("onlyStudentsCanSubmit");

    const homework = await this.prisma.homework.findFirst({
      where: { id: homeworkId, isPublished: true },
      select: {
        id: true,
        type: true,
        maxAttempts: true,
        dueDate: true,
        allowLate: true,
        latePenalty: true,
        requiresManualReview: true,
        lesson: { select: { courseId: true } },
      },
    });
    if (!homework) throw new NotFoundException("homeworkNotFound");

    // Отчисленный (billingEndsAt без группы) сдавать домашку не может —
    // запись жива только ради истории начислений
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: user.id, courseId: homework.lesson.courseId, ...activeEnrollmentFilter() },
      select: { id: true },
    });
    if (!enrollment) throw new ForbiddenException("notEnrolled");

    const isLate = homework.dueDate ? new Date() > homework.dueDate : false;
    if (isLate && !homework.allowLate) throw new ForbiddenException("deadlineExpired");

    const used = await this.prisma.submission.count({
      where: { homeworkId, studentId: user.id },
    });
    if (used >= homework.maxAttempts) throw new ConflictException("maxAttemptsReached");

    return {
      homework,
      isLate,
      penalty: isLate ? homework.latePenalty : 0,
      attemptNumber: used + 1,
    };
  }

  /** Гонку за номер попытки ловит уникальный индекс, а не подсчёт. */
  private isDuplicateAttempt(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    );
  }

  /**
   * Заводит работу, пересчитывая номер попытки при столкновении. Уникальный
   * индекс отсекает гонку, но сам по себе он отклонил бы и законную вторую
   * сдачу: две параллельные получили бы один номер, и выжила бы только одна.
   * Поэтому на P2002 номер берётся заново — вместе с проверкой лимита.
   */
  private async createWithAttemptNumber<T>(
    homeworkId: string,
    user: SessionUser,
    create: (attempt: Awaited<ReturnType<SubmissionsService["prepareAttempt"]>>) => Promise<T>
  ): Promise<T> {
    const MAX_RETRIES = 5;

    for (let retry = 0; ; retry++) {
      const attempt = await this.prepareAttempt(homeworkId, user);
      try {
        return await create(attempt);
      } catch (error) {
        if (this.isDuplicateAttempt(error) && retry < MAX_RETRIES) continue;
        if (this.isDuplicateAttempt(error)) throw new ConflictException("maxAttemptsReached");
        throw error;
      }
    }
  }

  /** Сдача текстом. Для CODE-задания автопроверки нет — отказ. */
  async submitText(homeworkId: string, code: string, user: SessionUser) {
    return this.createWithAttemptNumber(homeworkId, user, (attempt) => {
      if (attempt.homework.type === "CODE") {
        throw new ForbiddenException("codeHomeworkDisabled");
      }

      return this.prisma.submission.create({
        data: {
          code,
          status: "PENDING",
          studentId: user.id,
          homeworkId,
          attemptNumber: attempt.attemptNumber,
          isLate: attempt.isLate,
          penalty: attempt.penalty,
          // Текстовую работу читает человек: автотестов у неё нет
          manualStatus: "PENDING",
        },
      });
    });
  }

  /**
   * Сдача файлом. Файл уже лежит на диске (его записал multer потоком), в
   * базу попадают имя, путь и размер. Тип определяется по расширению, а не по
   * присланному заголовку.
   */
  async submitFile(
    homeworkId: string,
    file: { originalname: string; path: string; size: number },
    user: SessionUser
  ) {
    try {
      return await this.createWithAttemptNumber(homeworkId, user, (attempt) =>
        this.prisma.submission.create({
          data: {
            homeworkId,
            studentId: user.id,
            code: fileSubmissionPlaceholder(file.originalname),
            status: "PENDING",
            attemptNumber: attempt.attemptNumber,
            isLate: attempt.isLate,
            penalty: attempt.penalty,
            manualStatus: "PENDING",
            files: {
              create: {
                filename: file.originalname,
                path: file.path,
                mimeType: submissionMimeType(file.originalname),
                size: file.size,
              },
            },
          },
          include: { files: { select: { id: true, filename: true, size: true } } },
        })
      );
    } catch (error) {
      // Работа не завелась — осиротевший файл на диске не оставляем
      await unlink(file.path).catch(() => {});
      throw error;
    }
  }

  /** Сдачи по заданию — преподавателю курса. */
  async byHomework(homeworkId: string, ability: AppAbility) {
    await this.manageableHomework(ability, homeworkId);

    return this.prisma.submission.findMany({
      where: { homeworkId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, login: true } },
        files: { select: { id: true, filename: true, size: true } },
        testResults: {
          include: {
            testCase: { select: { id: true, input: true, expected: true, description: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Очередь на проверку: свои курсы преподавателю, все — администратору. */
  pending(user: SessionUser) {
    return this.prisma.submission.findMany({
      where: { manualStatus: "PENDING", ...this.ownCoursesWhere(user) },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        homework: {
          select: {
            id: true,
            slug: true,
            title: true,
            type: true,
            language: true,
            requiresManualReview: true,
            lesson: {
              select: {
                id: true,
                slug: true,
                title: true,
                course: { select: { id: true, slug: true, title: true } },
              },
            },
            _count: { select: { testCases: true } },
          },
        },
        testResults: { select: { passed: true } },
        files: { select: { id: true, filename: true, size: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** История проверок: администратору все, преподавателю — его собственные. */
  history(user: SessionUser) {
    return this.prisma.submission.findMany({
      where: {
        manualStatus: { in: ["APPROVED", "REJECTED", "REVISION"] },
        ...(user.role === "ADMIN" ? {} : { reviewedById: user.id }),
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        homework: {
          select: {
            id: true,
            slug: true,
            title: true,
            type: true,
            lesson: {
              select: {
                slug: true,
                title: true,
                course: { select: { slug: true, title: true } },
              },
            },
          },
        },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { reviewedAt: "desc" },
      take: 50,
    });
  }

  /** Работа для разбора преподавателем — со всеми данными проверок. */
  async forReview(submissionId: string, ability: AppAbility) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, login: true } },
        homework: {
          include: {
            lesson: {
              select: {
                slug: true,
                title: true,
                courseId: true,
                course: { select: { slug: true, title: true, teacherId: true } },
              },
            },
            testCases: {
              select: { id: true, description: true, isHidden: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        testResults: {
          include: {
            testCase: {
              select: { description: true, expected: true, input: true, isHidden: true },
            },
          },
        },
        // Без path: путь на диске интерфейсу не нужен, а устройство сервера
        // выдавать незачем
        files: { select: { id: true, filename: true, mimeType: true, size: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!submission) throw new NotFoundException("submissionNotFound");

    await this.manageableCourse(ability, submission.homework.lesson.courseId);
    return submission;
  }

  /**
   * Проверка работы преподавателем. Балл ограничен сверху `maxScore` задания:
   * раньше проверки не было вовсе и можно было поставить сколько угодно
   * (аудит 3.6).
   */
  async review(
    submissionId: string,
    data: { status: "APPROVED" | "REJECTED" | "REVISION"; comment?: string; manualScore?: number | null },
    ability: AppAbility,
    actor: SessionUser
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        manualStatus: true,
        manualScore: true,
        teacherComment: true,
        studentId: true,
        homeworkId: true,
        homework: {
          select: { maxScore: true, lesson: { select: { courseId: true } } },
        },
      },
    });
    if (!submission) throw new NotFoundException("submissionNotFound");

    await this.manageableCourse(ability, submission.homework.lesson.courseId);

    const maxScore = submission.homework.maxScore;
    if (data.manualScore != null && data.manualScore > maxScore) {
      throw new BadRequestException("scoreAboveMax");
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        manualStatus: data.status,
        teacherComment: data.comment || null,
        manualScore: data.manualScore ?? null,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Submission",
      entityId: submissionId,
      action: "UPDATE",
      changes: computeChanges(
        {
          manualStatus: submission.manualStatus,
          manualScore: submission.manualScore,
          teacherComment: submission.teacherComment,
        },
        {
          manualStatus: updated.manualStatus,
          manualScore: updated.manualScore,
          teacherComment: updated.teacherComment,
        }
      ),
      metadata: { studentId: submission.studentId, homeworkId: submission.homeworkId },
    });

    return updated;
  }

  /**
   * Счётчик в шапке: ученику — сколько заданий ждут его, персоналу — сколько
   * работ ждут проверки.
   */
  async counts(user: SessionUser) {
    if (user.role !== "STUDENT") {
      const count = await this.prisma.submission.count({
        where: { manualStatus: "PENDING", ...this.ownCoursesWhere(user) },
      });
      return { count };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: user.id },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((enrollment) => enrollment.courseId);
    if (courseIds.length === 0) return { count: 0 };

    const homeworks = await this.prisma.homework.findMany({
      where: {
        isPublished: true,
        lesson: { courseId: { in: courseIds }, isPublished: true },
      },
      select: {
        id: true,
        requiresManualReview: true,
        dueDate: true,
        submissions: {
          where: { studentId: user.id },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, manualStatus: true },
        },
      },
    });

    const now = new Date();
    let count = 0;
    for (const homework of homeworks) {
      const last = homework.submissions[0];
      const inTime = !homework.dueDate || homework.dueDate > now;

      if (!last) {
        if (inTime) count++;
        continue;
      }
      if (last.manualStatus === "REVISION") {
        count++;
        continue;
      }
      const isCompleted =
        (last.status === "PASSED" && !homework.requiresManualReview) ||
        last.manualStatus === "APPROVED";
      if (!isCompleted && last.manualStatus !== "PENDING" && inTime) count++;
    }

    return { count };
  }

  /** Работы своих курсов; администратору — все. */
  private ownCoursesWhere(user: SessionUser): Prisma.SubmissionWhereInput {
    if (user.role === "ADMIN") return {};
    return { homework: { lesson: { course: { teacherId: user.id } } } };
  }

  private async manageableCourse(ability: AppAbility, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course", "update"), { id: courseId }],
      },
      select: { id: true },
    });
    if (!course) throw new ForbiddenException("onlyOwnCourses");
    return course;
  }

  private async manageableHomework(ability: AppAbility, homeworkId: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id: homeworkId },
      select: { id: true, lesson: { select: { courseId: true } } },
    });
    if (!homework) throw new NotFoundException("homeworkNotFound");
    await this.manageableCourse(ability, homework.lesson.courseId);
    return homework;
  }
}

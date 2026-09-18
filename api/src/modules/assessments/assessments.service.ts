import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import { scoreAssessment } from "./domain/assessment-scoring";
import type {
  CreateAssessmentDto,
  CreateQuestionDto,
  SubmitAttemptDto,
  UpdateAssessmentDto,
  UpdateQuestionDto,
} from "./dto/assessment.dto";

// Запас на дорогу ответа: таймер в браузере и часы сервера не совпадают
// секунда в секунду, и честная отправка в последний момент не должна пропасть.
const SUBMIT_GRACE_MS = 30_000;

const QUESTION_INCLUDE = {
  questions: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
} as const;

/** Перенесено из src/actions/assessment-actions.ts в web. */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Правильные ответы вырезаются всем, кроме персонала. Раньше это была
   * проверка `role === "STUDENT"`, и роль PARENT получала ключи ко всем
   * тестам школы (аудит 2.4).
   */
  private sanitize<T extends { questions: { options: { id: string; text: string; sortOrder: number; questionId: string; isCorrect: boolean }[] }[] }>(
    assessment: T,
    ability: AppAbility
  ) {
    if (ability.can("read", "AssessmentAnswers")) return assessment;
    return {
      ...assessment,
      questions: assessment.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => ({
          id: option.id,
          text: option.text,
          sortOrder: option.sortOrder,
          questionId: option.questionId,
        })),
      })),
    };
  }

  private visibilityWhere(ability: AppAbility): Prisma.AssessmentWhereInput {
    return ability.can("read", "UnpublishedContent") ? {} : { isPublished: true };
  }

  async byId(assessmentId: string, ability: AppAbility) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, ...this.visibilityWhere(ability) },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        lesson: { select: { id: true, title: true } },
        _count: { select: { attempts: true } },
        ...QUESTION_INCLUDE,
      },
    });
    if (!assessment) throw new NotFoundException("assessmentNotFound");
    return this.sanitize(assessment, ability);
  }

  async byLesson(lessonId: string, ability: AppAbility) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { lessonId, ...this.visibilityWhere(ability) },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        lesson: { select: { id: true, title: true } },
        _count: { select: { attempts: true } },
        ...QUESTION_INCLUDE,
      },
    });
    if (!assessment) throw new NotFoundException("testNotFound");
    return this.sanitize(assessment, ability);
  }

  byCourse(courseId: string, type: "TEST" | "EXAM" | undefined, ability: AppAbility) {
    return this.prisma.assessment.findMany({
      where: { courseId, ...(type ? { type } : {}), ...this.visibilityWhere(ability) },
      include: {
        lesson: { select: { id: true, title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async create(data: CreateAssessmentDto, ability: AppAbility, actor: SessionUser) {
    await this.manageableCourse(ability, data.courseId);

    const assessment = await this.prisma.assessment.create({
      data: {
        courseId: data.courseId,
        lessonId: data.lessonId,
        type: data.type,
        title: data.title,
        description: data.description,
        passingScore: data.passingScore,
        timeLimitMin: data.timeLimitMin ?? null,
        maxAttempts: data.maxAttempts,
        sortOrder: data.sortOrder,
        isPublished: data.isPublished,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Assessment",
      entityId: assessment.id,
      action: "CREATE",
      metadata: { title: assessment.title, type: assessment.type, courseId: data.courseId },
    });
    return assessment;
  }

  async update(id: string, data: UpdateAssessmentDto, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageableAssessment(ability, id);

    const assessment = await this.prisma.assessment.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
        ...(data.timeLimitMin !== undefined && { timeLimitMin: data.timeLimitMin }),
        ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
      },
    });

    const changes = computeChanges(
      { title: existing.title, isPublished: existing.isPublished, passingScore: existing.passingScore },
      { ...data }
    );
    if (changes) {
      await this.audit.record({
        userId: actor.id,
        entityType: "Assessment",
        entityId: id,
        action: "UPDATE",
        changes,
      });
    }
    return assessment;
  }

  async remove(id: string, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageableAssessment(ability, id);
    await this.prisma.assessment.delete({ where: { id } });

    await this.audit.record({
      userId: actor.id,
      entityType: "Assessment",
      entityId: id,
      action: "DELETE",
      metadata: { title: existing.title, courseId: existing.courseId },
    });
  }

  async addQuestion(data: CreateQuestionDto, ability: AppAbility) {
    await this.manageableAssessment(ability, data.assessmentId);

    return this.prisma.assessmentQuestion.create({
      data: {
        assessmentId: data.assessmentId,
        text: data.text,
        type: data.type,
        points: data.points,
        sortOrder: data.sortOrder,
        options: {
          create: data.options.map((option, index) => ({
            text: option.text,
            isCorrect: option.isCorrect ?? false,
            sortOrder: option.sortOrder ?? index,
          })),
        },
      },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async updateQuestion(questionId: string, data: UpdateQuestionDto, ability: AppAbility) {
    const question = await this.prisma.assessmentQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, assessmentId: true },
    });
    if (!question) throw new NotFoundException("questionNotFound");
    await this.manageableAssessment(ability, question.assessmentId);

    return this.prisma.$transaction(async (tx) => {
      if (data.options) {
        // Варианты заменяются целиком: у них нет устойчивых идентификаторов
        // в форме, а точечная правка перемешала бы порядок
        await tx.assessmentAnswerOption.deleteMany({ where: { questionId } });
        await tx.assessmentAnswerOption.createMany({
          data: data.options.map((option, index) => ({
            questionId,
            text: option.text,
            isCorrect: option.isCorrect ?? false,
            sortOrder: option.sortOrder ?? index,
          })),
        });
      }

      return tx.assessmentQuestion.update({
        where: { id: questionId },
        data: {
          ...(data.text !== undefined && { text: data.text }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.points !== undefined && { points: data.points }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });
    });
  }

  async deleteQuestion(questionId: string, ability: AppAbility) {
    const question = await this.prisma.assessmentQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, assessmentId: true },
    });
    if (!question) throw new NotFoundException("questionNotFound");
    await this.manageableAssessment(ability, question.assessmentId);

    await this.prisma.assessmentQuestion.delete({ where: { id: questionId } });
  }

  /**
   * Допуск к экзамену: сданы ли все тесты уроков курса. Для теста допуск не
   * нужен. Проверка вызывается и интерфейсом, и самой сдачей — раньше она жила
   * только в интерфейсе, и прямой вызов сдавал экзамен без единого теста
   * (аудит 3.2).
   */
  async eligibility(assessmentId: string, user: SessionUser) {
    if (user.role !== "STUDENT") return { eligible: true, unpassedTests: [] };

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { courseId: true, type: true },
    });
    if (!assessment) throw new NotFoundException("assessmentNotFound");
    if (assessment.type === "TEST") return { eligible: true, unpassedTests: [] };

    return this.courseEligibility(assessment.courseId, user);
  }

  /** Тот же допуск, но для списка экзаменов курса: конкретного экзамена там ещё нет. */
  async courseEligibility(courseId: string, user: SessionUser) {
    if (user.role !== "STUDENT") return { eligible: true, unpassedTests: [] };

    const lessonTests = await this.prisma.assessment.findMany({
      where: { courseId, type: "TEST", isPublished: true, lessonId: { not: null } },
      include: { lesson: { select: { title: true } } },
    });

    const passed = await this.prisma.assessmentAttempt.findMany({
      where: { studentId: user.id, isPassed: true, assessmentId: { in: lessonTests.map((t) => t.id) } },
      select: { assessmentId: true },
    });
    const passedIds = new Set(passed.map((attempt) => attempt.assessmentId));

    const unpassedTests = lessonTests
      .filter((test) => !passedIds.has(test.id))
      .map((test) => ({ lessonTitle: test.lesson?.title ?? "", testTitle: test.title }));

    return { eligible: unpassedTests.length === 0, unpassedTests };
  }

  /**
   * Начало попытки. Строка создаётся здесь, а не при отправке: только так у
   * сервера есть startedAt, с которым можно сверить ограничение по времени
   * (аудит 3.3). Номер попытки уникален на пару (тест, ученик), поэтому две
   * параллельные попытки сверх лимита не пройдут (аудит 3.4).
   */
  async startAttempt(assessmentId: string, user: SessionUser) {
    if (user.role !== "STUDENT") throw new ForbiddenException("onlyStudentsCanTake");

    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, isPublished: true },
      select: { id: true, courseId: true, maxAttempts: true, timeLimitMin: true, type: true },
    });
    if (!assessment) throw new NotFoundException("assessmentNotFound");

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: user.id, courseId: assessment.courseId } },
      select: { id: true },
    });
    if (!enrollment) throw new ForbiddenException("notEnrolled");

    const { eligible } = await this.eligibility(assessmentId, user);
    if (!eligible) throw new ForbiddenException("notEligible");

    const used = await this.prisma.assessmentAttempt.count({
      where: { assessmentId, studentId: user.id },
    });
    if (used >= assessment.maxAttempts) throw new ConflictException("maxAttemptsReached");

    try {
      const attempt = await this.prisma.assessmentAttempt.create({
        data: {
          assessmentId,
          studentId: user.id,
          attemptNumber: used + 1,
          startedAt: new Date(),
        },
        select: { id: true, startedAt: true, attemptNumber: true },
      });

      return {
        ...attempt,
        timeLimitMin: assessment.timeLimitMin,
        // Крайний срок считает сервер: браузерный таймер — только отображение
        expiresAt: assessment.timeLimitMin
          ? new Date(attempt.startedAt.getTime() + assessment.timeLimitMin * 60_000).toISOString()
          : null,
      };
    } catch (error) {
      // Гонка: параллельный запрос занял этот номер попытки
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("attemptAlreadyStarted");
      }
      throw error;
    }
  }

  /** Отправка ответов начатой попытки. */
  async submitAttempt(attemptId: string, data: SubmitAttemptDto, user: SessionUser) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: { include: QUESTION_INCLUDE } },
    });
    if (!attempt || attempt.studentId !== user.id) throw new NotFoundException("attemptNotFound");
    if (attempt.completedAt) throw new ConflictException("attemptAlreadyCompleted");

    const limitMin = attempt.assessment.timeLimitMin;
    if (limitMin) {
      const deadline = attempt.startedAt.getTime() + limitMin * 60_000 + SUBMIT_GRACE_MS;
      if (Date.now() > deadline) {
        // Время вышло: попытка закрывается нулём, иначе она осталась бы
        // «висеть» и её можно было бы отправить позже
        await this.prisma.assessmentAttempt.update({
          where: { id: attemptId },
          data: { completedAt: new Date(), score: 0, percentage: 0, isPassed: false },
        });
        throw new BadRequestException("timeIsUp");
      }
    }

    const scored = scoreAssessment(attempt.assessment.questions, data.answers);
    const isPassed = scored.percentage >= attempt.assessment.passingScore;

    const completed = await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        score: scored.score,
        maxScore: scored.maxScore,
        percentage: scored.percentage,
        isPassed,
        completedAt: new Date(),
        answers: {
          create: scored.answers.map((answer) => ({
            questionId: answer.questionId,
            selectedOptionIds: answer.selectedOptionIds,
            isCorrect: answer.isCorrect,
            pointsEarned: answer.pointsEarned,
          })),
        },
      },
      include: { answers: true },
    });

    return completed;
  }

  /**
   * Свои попытки — для ученика. Ответы отдаются только по завершённым
   * попыткам: в них лежат правильные варианты, и по начатой попытке это был
   * бы способ подсмотреть ответы прямо во время теста.
   */
  async myAttempts(assessmentId: string, user: SessionUser) {
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { assessmentId, studentId: user.id },
      include: {
        answers: {
          include: { question: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
        },
      },
      orderBy: [{ startedAt: "desc" }],
    });

    return attempts.map((attempt) =>
      attempt.completedAt ? attempt : { ...attempt, answers: [] }
    );
  }

  /** Лучший результат ученика по тесту — для плашки на странице урока. */
  myBestAttempt(assessmentId: string, user: SessionUser) {
    return this.prisma.assessmentAttempt.findFirst({
      where: { assessmentId, studentId: user.id, completedAt: { not: null } },
      orderBy: { percentage: "desc" },
      select: { percentage: true, isPassed: true },
    });
  }

  /** Попытки по тесту — для преподавателя. */
  async attempts(assessmentId: string, ability: AppAbility) {
    await this.manageableAssessment(ability, assessmentId);

    return this.prisma.assessmentAttempt.findMany({
      where: { assessmentId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        answers: {
          include: { question: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
        },
      },
      orderBy: [{ startedAt: "desc" }],
    });
  }

  /**
   * Результаты одного ученика: сам ученик, его родитель или персонал. Родство
   * проверяется — раньше id брался из аргумента для любой роли (аудит 2.4).
   */
  async studentResults(requestedStudentId: string | undefined, user: SessionUser) {
    let studentId: string;

    if (user.role === "STUDENT") {
      studentId = user.id;
    } else if (!requestedStudentId) {
      throw new BadRequestException("studentRequired");
    } else if (user.role === "PARENT") {
      const link = await this.prisma.parentStudent.findUnique({
        where: { parentId_studentId: { parentId: user.id, studentId: requestedStudentId } },
        select: { id: true },
      });
      if (!link) throw new NotFoundException("studentNotFound");
      studentId = requestedStudentId;
    } else {
      studentId = requestedStudentId;
    }

    return this.prisma.assessmentAttempt.findMany({
      where: { studentId, completedAt: { not: null } },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            type: true,
            passingScore: true,
            maxAttempts: true,
            lessonId: true,
            // slug нужен ссылкам «мои результаты» на урок и курс
            lesson: { select: { id: true, slug: true, title: true } },
            course: { select: { id: true, slug: true, title: true } },
          },
        },
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { startedAt: "desc" },
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

  /** Тест, курсом которого вызывающий вправе управлять. Чужой — 404. */
  private async manageableAssessment(ability: AppAbility, id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      select: { id: true, title: true, courseId: true, isPublished: true, passingScore: true },
    });
    if (!assessment) throw new NotFoundException("assessmentNotFound");
    await this.manageableCourse(ability, assessment.courseId);
    return assessment;
  }
}

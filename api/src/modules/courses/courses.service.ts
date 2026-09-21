import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import type { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../common/prisma/prisma.service";
import { generateUniqueSlug, slugify } from "../../common/slugify";
import { activeEnrollmentFilter, BillingLedgerService } from "../billing/billing-ledger.service";
import { SalaryService } from "../salary/salary.service";
import type { CreateCourseDto, UpdateCourseDto } from "./dto/course.dto";

const COURSE_INCLUDE = {
  teacher: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Перенесено из src/actions/course-actions.ts в web. */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: BillingLedgerService,
    private readonly salary: SalaryService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Без фильтра мягкого удаления: slug удалённого курса остаётся занятым. */
  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  /**
   * Список курсов. Права решают, что человек вправе видеть; преподавателю
   * список дополнительно сужается до его курсов — это раскладка интерфейса, а
   * не запрет: чужой курс он по-прежнему может открыть по ссылке (решение
   * владельца от 2026-09-16, преподаватели подменяют друг друга).
   */
  list(ability: AppAbility, user: SessionUser) {
    return this.prisma.course.findMany({
      where: {
        AND: [
          accessibleWhere<Prisma.CourseWhereInput>(ability, "Course"),
          ...(user.role === "TEACHER" ? [{ teacherId: user.id }] : []),
        ],
      },
      include: { ...COURSE_INCLUDE, _count: { select: { enrollments: true, lessons: true } } },
      orderBy: { sortOrder: "asc" },
    });
  }

  async byId(ability: AppAbility, id: string) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course"), { id }] },
      include: {
        ...COURSE_INCLUDE,
        copiedFrom: {
          select: {
            id: true,
            slug: true,
            title: true,
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { enrollments: true, lessons: true, copies: true } },
      },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    return course;
  }

  /** slug → id для страниц кабинета: адреса построены на slug, связи — на id. */
  async idBySlug(ability: AppAbility, slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course"), { slug }] },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    return course;
  }

  async create(data: CreateCourseDto, ability: AppAbility, actor: SessionUser) {
    // Преподаватель заводит курсы только на себя
    if (!ability.can("manage", "all") && data.teacherId !== actor.id) {
      throw new BadRequestException("onlyOwnCourses");
    }

    // Занятость slug проверяем без фильтра мягкого удаления: уникальный индекс
    // в БД про deletedAt не знает, поэтому slug держит и удалённый курс.
    const slug = await generateUniqueSlug(
      slugify(data.title),
      async (candidate) =>
        Boolean(await this.prismaUnscoped.course.findUnique({ where: { slug: candidate }, select: { id: true } }))
    );

    const course = await this.prisma.course.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        coverImage: data.coverImage ?? undefined,
        teacherId: data.teacherId,
        accessType: data.accessType ?? "CLOSED",
        isPublicListed: data.isPublicListed ?? false,
        price: data.price,
        publicSummaryRu: data.publicSummaryRu,
        publicSummaryUz: data.publicSummaryUz,
        intakeStartDate: data.intakeStartDate ? toNoonUtc(data.intakeStartDate) : undefined,
        intakeSeats: data.intakeSeats,
        intakeNoteRu: data.intakeNoteRu,
        intakeNoteUz: data.intakeNoteUz,
      },
      include: COURSE_INCLUDE,
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Course",
      entityId: course.id,
      action: "CREATE",
      metadata: { title: course.title },
    });
    return course;
  }

  async update(id: string, data: UpdateCourseDto, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageable(ability, id);

    let slugUpdate: { slug: string } | Record<string, never> = {};
    if (data.title !== undefined && data.title !== existing.title) {
      const newSlug = await generateUniqueSlug(slugify(data.title), async (candidate) => {
        const found = await this.prismaUnscoped.course.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return Boolean(found) && found!.id !== id;
      });
      slugUpdate = { slug: newSlug };
    }

    // Цена курса меняется только вперёд. Заморозка ленивая, поэтому сначала
    // фиксируем закрытые месяцы по старой цене — иначе месяц, который никто
    // ещё не открывал после его конца, заморозился бы уже по новой
    if (data.price !== undefined && data.price !== existing.price) {
      await this.ledger.freezeClosedMonths({ courseId: id });
    }

    const course = await this.prisma.course.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...slugUpdate,
        ...(data.description !== undefined && { description: data.description }),
        ...(data.coverImage !== undefined && { coverImage: data.coverImage }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.accessType !== undefined && { accessType: data.accessType }),
        ...(data.isPublicListed !== undefined && { isPublicListed: data.isPublicListed }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.publicSummaryRu !== undefined && { publicSummaryRu: data.publicSummaryRu }),
        ...(data.publicSummaryUz !== undefined && { publicSummaryUz: data.publicSummaryUz }),
        ...(data.intakeStartDate !== undefined && { intakeStartDate: toNoonUtc(data.intakeStartDate) }),
        ...(data.intakeSeats !== undefined && { intakeSeats: data.intakeSeats }),
        ...(data.intakeNoteRu !== undefined && { intakeNoteRu: data.intakeNoteRu }),
        ...(data.intakeNoteUz !== undefined && { intakeNoteUz: data.intakeNoteUz }),
      },
      include: COURSE_INCLUDE,
    });

    const changes = computeChanges(
      {
        title: existing.title,
        description: existing.description,
        coverImage: existing.coverImage,
        isPublished: existing.isPublished,
        sortOrder: existing.sortOrder,
      },
      { ...data }
    );
    if (changes) {
      await this.audit.record({
        userId: actor.id,
        entityType: "Course",
        entityId: id,
        action: "UPDATE",
        changes,
      });
    }
    return course;
  }

  /**
   * Мягкое удаление: курс уходит в Корзину. Уроки, записи студентов и оплаты
   * сохраняются; администратор может восстановить курс или стереть его
   * окончательно из Корзины.
   */
  async remove(id: string, ability: AppAbility, actor: SessionUser) {
    const existing = await this.manageable(ability, id);

    await this.prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.record({
      userId: actor.id,
      entityType: "Course",
      entityId: id,
      action: "DELETE",
      metadata: { title: existing.title },
    });
  }

  /**
   * Записанные на курс. groupId сужает список до учеников одной группы: занятие
   * посещаемости заводится на группу, и отмечать в нём учеников других групп
   * нельзя.
   *
   * Отчисленные (unenrolledAt) в список не попадают — они больше не учащиеся
   * курса, хоть запись и осталась ради истории начислений. Приостановленный
   * (billingEndsAt есть, unenrolledAt нет) — не отчисление, остаётся видимым:
   * activeEnrollmentFilter().
   */
  async enrolledStudents(courseId: string, groupId?: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, ...(groupId ? { groupId } : {}), ...activeEnrollmentFilter() },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, login: true, phone: true, isActive: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return enrollments.map((enrollment) => ({ ...enrollment.student, enrolledAt: enrollment.createdAt }));
  }

  /** Кого можно записать на курс. Отчисленный ранее (история есть, но не активен) — снова доступен. */
  availableStudents(courseId: string) {
    return this.prisma.user.findMany({
      where: {
        role: "STUDENT",
        isActive: true,
        NOT: { enrollments: { some: { courseId, ...activeEnrollmentFilter() } } },
      },
      select: { id: true, firstName: true, lastName: true, login: true, phone: true },
      orderBy: { firstName: "asc" },
    });
  }

  async enrollStudent(courseId: string, studentId: string, ability: AppAbility, actor: SessionUser) {
    await this.manageable(ability, courseId);

    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { role: true } });
    if (!student || student.role !== "STUDENT") throw new NotFoundException("studentNotFound");

    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { id: true, unenrolledAt: true },
    });

    // Отчисленная запись (unenrolledAt) — не «уже записан»: уникальность
    // (studentId, courseId) не даст завести вторую строку, поэтому
    // возвращаем ту же самую студенту, а не блокируем.
    const finished = existing && existing.unenrolledAt !== null;
    if (existing && !finished) throw new ConflictException("alreadyEnrolled");

    if (existing) {
      // Разрыв между отчислением и сегодня уже закрыт (заморожен на момент
      // отчисления) — тут только снимаем дату и статус, начисления и доступ
      // продолжаются с неё
      const enrollment = await this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { billingEndsAt: null, unenrolledAt: null },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      });
      await this.audit.record({
        userId: actor.id,
        entityType: "Enrollment",
        entityId: enrollment.id,
        action: "UPDATE",
        metadata: { courseId, studentId, revived: true },
      });
      return enrollment;
    }

    const enrollment = await this.prisma.enrollment.create({
      data: { studentId, courseId },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Enrollment",
      entityId: enrollment.id,
      action: "CREATE",
      metadata: { courseId, studentId },
    });
    return enrollment;
  }

  async unenrollStudent(courseId: string, studentId: string, ability: AppAbility, actor: SessionUser) {
    await this.manageable(ability, courseId);

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { id: true, groupId: true },
    });
    if (!enrollment) throw new NotFoundException("enrollmentNotFound");

    // Закрытые месяцы фиксируем ДО отчисления — ленивая заморозка иначе
    // посчитала бы ещё не зафиксированный месяц уже с billingEndsAt ниже.
    // Зарплата опирается на уже зафиксированные начисления — строго после
    // биллинговой (план зарплат, 5.4).
    await this.ledger.freezeClosedMonths({ enrollmentId: enrollment.id });
    await this.salary.freezeClosedMonths({ groupId: enrollment.groupId, courseId });

    // Ни начислений, ни оплат — заведена по ошибке, можно стереть, как
    // раньше. Иначе запись хранит платёжную историю: физическое удаление
    // унесло бы её каскадом вместе с MonthlyCharge — ровно тот баг, который
    // мы здесь чиним.
    const [chargesCount, paymentsCount] = await Promise.all([
      this.prisma.monthlyCharge.count({ where: { enrollmentId: enrollment.id } }),
      this.prisma.payment.count({ where: { studentId, courseId, deletedAt: null } }),
    ]);
    const hasHistory = chargesCount > 0 || paymentsCount > 0;

    if (hasHistory) {
      // Снимаем группу (если была), ставим дату отчисления — начисления
      // дальше не идут — и unenrolledAt: доступ к курсу закрывает именно им,
      // а не связкой groupId+billingEndsAt (см. комментарий у поля в
      // schema.prisma). Оплаты и MonthlyCharge остаются на месте.
      const now = toNoonUtc(new Date().toISOString().slice(0, 10));
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { groupId: null, billingEndsAt: now, unenrolledAt: now },
      });
    } else {
      await this.prisma.enrollment.delete({ where: { id: enrollment.id } });
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "Enrollment",
      entityId: `${studentId}:${courseId}`,
      action: hasHistory ? "UPDATE" : "DELETE",
      metadata: { courseId, studentId, finished: hasHistory },
    });
  }

  /**
   * Курс, которым вызывающий вправе управлять. Недоступный — 404, а не 403:
   * ответ не должен подтверждать, что курс существует.
   */
  private async manageable(ability: AppAbility, id: string) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course", "update"), { id }] },
      select: {
        id: true,
        title: true,
        price: true,
        description: true,
        coverImage: true,
        isPublished: true,
        sortOrder: true,
        teacherId: true,
      },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    return course;
  }
}

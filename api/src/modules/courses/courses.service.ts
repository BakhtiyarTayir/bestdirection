import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
    // Цена курса — вход расчёта зарплаты (база для групп без своей цены),
    // её смену тоже нужно замораживать перед записью новой цены — update()
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

    // Цена курса — только для витрины (каталог, заявки, лендинг): в
    // начислениях она не участвует (решение владельца 2026-09-23), поэтому
    // её смена ничего не замораживает

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

    // Дата переноса в Корзину останавливает начисления (toBillingEnrollment),
    // а заморозка ленивая: закрытые месяцы фиксируем ДО, иначе ещё не
    // открытый месяц посчитался бы уже с новой датой окончания
    await this.ledger.freezeClosedMonths({ courseId: id });
    await this.salary.freezeClosedMonths({ courseId: id });

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

  // enrollStudent/unenrollStudent/availableStudents отсюда убраны (план
  // «Учеников добавляют только в группу», этап 5-бис): запись и отчисление
  // теперь идут только через GroupsService.addStudents/removeStudent — та же
  // логика (повтор после отчисления, сохранение истории, заморозка закрытых
  // месяцев) там уже реализована и покрыта test/groups.e2e-spec.ts. Своими
  // путями остаются enrollment-requests (заявки/самозапись) и создание
  // ученика в users.service — их эта правка не касается.

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

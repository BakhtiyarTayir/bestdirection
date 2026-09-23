import { Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import { CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingLedgerService } from "../billing/billing-ledger.service";
import { SalaryService } from "../salary/salary.service";
import { TrashService } from "./trash.service";
import { ConflictException, NotFoundException } from "@nestjs/common";

/**
 * Корзина: удалённые курсы и уроки, восстановление и окончательное удаление.
 * Перенесено из src/actions/admin-actions.ts в web. Только администратор.
 */
@Controller("trash")
export class TrashController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly trash: TrashService,
    private readonly audit: AuditService,
    private readonly ledger: BillingLedgerService,
    private readonly salary: SalaryService
  ) {}

  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  @CheckPolicies((ability) => ability.can("manage", "Trash"))
  @Get("courses")
  deletedCourses() {
    return this.prismaUnscoped.course.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        title: true,
        slug: true,
        deletedAt: true,
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
      orderBy: { deletedAt: "desc" },
    });
  }

  @CheckPolicies((ability) => ability.can("manage", "Trash"))
  @Get("lessons")
  deletedLessons() {
    return this.prismaUnscoped.lesson.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        title: true,
        slug: true,
        deletedAt: true,
        course: { select: { id: true, title: true, slug: true, deletedAt: true } },
      },
      orderBy: { deletedAt: "desc" },
    });
  }

  @CheckPolicies((ability) => ability.can("manage", "Trash"))
  @Post("courses/:id/restore")
  async restoreCourse(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    const course = await this.prismaUnscoped.course.findUnique({
      where: { id },
      select: { id: true, title: true, deletedAt: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    if (!course.deletedAt) throw new ConflictException("notInTrash");

    // Пока курс лежал в Корзине, начислений не было (дата переноса — дата
    // окончания). Фиксируем эти закрытые месяцы нулями ДО восстановления:
    // иначе после него они посчитались бы по полной цене задним числом
    await this.ledger.freezeClosedMonths({ courseId: id });
    await this.salary.freezeClosedMonths({ courseId: id });

    await this.prismaUnscoped.course.update({ where: { id }, data: { deletedAt: null } });
    await this.audit.record({
      userId: actor.id,
      entityType: "Course",
      entityId: id,
      action: "UPDATE",
      metadata: { restored: true, title: course.title },
    });
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("manage", "Trash"))
  @Post("lessons/:id/restore")
  async restoreLesson(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    const lesson = await this.prismaUnscoped.lesson.findUnique({
      where: { id },
      select: { id: true, title: true, deletedAt: true, course: { select: { deletedAt: true } } },
    });
    if (!lesson) throw new NotFoundException("lessonNotFound");
    if (!lesson.deletedAt) throw new ConflictException("notInTrash");
    // Урок внутри удалённого курса восстанавливать некуда: сначала курс
    if (lesson.course.deletedAt) throw new ConflictException("courseInTrash");

    await this.prismaUnscoped.lesson.update({ where: { id }, data: { deletedAt: null } });
    await this.audit.record({
      userId: actor.id,
      entityType: "Lesson",
      entityId: id,
      action: "UPDATE",
      metadata: { restored: true, title: lesson.title },
    });
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("manage", "Trash"))
  @Delete("courses/:id")
  async hardDeleteCourse(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    const result = await this.trash.hardDeleteCourseRecord(id, actor.id);
    if (!result.ok) throw new ConflictException(result.error);
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("manage", "Trash"))
  @Delete("lessons/:id")
  async hardDeleteLesson(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    const result = await this.trash.hardDeleteLessonRecord(id, actor.id);
    if (!result.ok) throw new ConflictException(result.error);
    return { ok: true };
  }
}

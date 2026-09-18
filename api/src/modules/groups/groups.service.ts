import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { dateInputToDb } from "../../common/date-only";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Prisma } from "../../../generated/prisma";
import { BillingLedgerService } from "../billing/billing-ledger.service";
import type { CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";

/** Перенесено из src/actions/group-actions.ts в web. */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: BillingLedgerService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Группы курса: порядок задаёт sortOrder. */
  byCourse(courseId: string) {
    return this.prisma.group.findMany({
      where: { courseId },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * Все группы. Преподавателю — только по его курсам: это раскладка раздела
   * «Группы», как было до переноса.
   */
  all(user: SessionUser) {
    return this.prisma.group.findMany({
      where: user.role === "TEACHER" ? { course: { teacherId: user.id } } : {},
      include: {
        course: { select: { id: true, slug: true, title: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ course: { title: "asc" } }, { sortOrder: "asc" }],
    });
  }

  async details(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!group) throw new NotFoundException("groupNotFound");
    return group;
  }

  async create(data: CreateGroupDto, ability: AppAbility, actor: SessionUser) {
    const course = await this.manageableCourse(ability, data.courseId);

    const existing = await this.prisma.group.findUnique({
      where: { courseId_name: { courseId: course.id, name: data.name } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("groupNameExists");

    const maxSort = await this.prisma.group.aggregate({
      where: { courseId: course.id },
      _max: { sortOrder: true },
    });

    const group = await this.prisma.group.create({
      data: {
        name: data.name,
        description: data.description,
        schedule: data.schedule,
        scheduleDays: data.scheduleDays,
        isActive: data.isActive,
        // Пустая строка из формы — цены у группы нет, берётся цена курса
        price: data.price === "" || data.price === undefined ? null : data.price,
        // Даты группы двигают начисления, поэтому нормализуем их к полудню UTC —
        // как startsAt у записи и paidAt у оплаты
        startDate: dateInputToDb(data.startDate) ?? null,
        endDate: dateInputToDb(data.endDate) ?? null,
        courseId: course.id,
        // Не указан явно — ведёт преподаватель курса. Отчёт по занятиям
        // опирается на это поле, и пустое значение выкинуло бы группу из него.
        teacherId: data.teacherId?.trim() ? data.teacherId : course.teacherId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Group",
      entityId: group.id,
      action: "CREATE",
      metadata: { groupName: group.name, courseId: course.id },
    });
    return group;
  }

  async update(groupId: string, data: UpdateGroupDto, ability: AppAbility, actor: SessionUser) {
    const group = await this.manageableGroup(ability, groupId);

    if (data.name && data.name !== group.name) {
      const existing = await this.prisma.group.findUnique({
        where: { courseId_name: { courseId: group.courseId, name: data.name } },
        select: { id: true },
      });
      if (existing) throw new ConflictException("groupNameExists");
    }

    // Цена, даты и расписание группы — входы начисления. Закрытые месяцы
    // окончательны, но заморозка ленивая: фиксируем их ДО записи, иначе
    // месяц, который ещё никто не открывал, заморозился бы по новым данным
    await this.ledger.freezeClosedMonths({ groupId });

    const updated = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.schedule !== undefined && { schedule: data.schedule }),
        ...(data.scheduleDays !== undefined && { scheduleDays: data.scheduleDays }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        // undefined — не трогаем, "" — убираем цену группы
        price: data.price === undefined ? undefined : data.price === "" ? null : data.price,
        // undefined — поле не трогаем, "" — очищаем, дата — полдень UTC
        startDate: dateInputToDb(data.startDate),
        endDate: dateInputToDb(data.endDate),
        // Пустая строка из формы = «убрать преподавателя», undefined = «не менять»
        teacherId: data.teacherId === undefined ? undefined : data.teacherId.trim() || null,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Group",
      entityId: groupId,
      action: "UPDATE",
      changes: computeChanges({ ...group }, { ...updated }),
    });
    return updated;
  }

  async remove(groupId: string, ability: AppAbility, actor: SessionUser) {
    const group = await this.manageableGroup(ability, groupId);

    // Студенты теряют цену и расписание группы — сначала фиксируем их
    // закрытые месяцы по нынешним данным
    await this.ledger.freezeClosedMonths({ groupId });

    // Записи на курс сохраняются, группа с них снимается
    await this.prisma.enrollment.updateMany({ where: { groupId }, data: { groupId: null } });
    await this.prisma.group.delete({ where: { id: groupId } });

    await this.audit.record({
      userId: actor.id,
      entityType: "Group",
      entityId: groupId,
      action: "DELETE",
      metadata: { groupName: group.name, courseId: group.courseId },
    });
    return { id: groupId };
  }

  async toggleActive(groupId: string, ability: AppAbility) {
    const group = await this.manageableGroup(ability, groupId);
    return this.prisma.group.update({
      where: { id: groupId },
      data: { isActive: !group.isActive },
    });
  }

  /**
   * Добавить учеников в группу. Выбор не ограничен записанными на курс,
   * поэтому роль и активность проверяем здесь: иначе в группу можно было бы
   * затащить преподавателя или отключённого пользователя.
   */
  async addStudents(groupId: string, studentIds: string[], ability: AppAbility) {
    const group = await this.manageableGroup(ability, groupId);

    const eligible = await this.prisma.user.findMany({
      where: { id: { in: studentIds }, role: "STUDENT", isActive: true },
      select: { id: true },
    });

    for (const { id: studentId } of eligible) {
      const existing = await this.prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId: group.courseId } },
        select: { id: true },
      });

      if (existing) {
        // Перевод из другой группы меняет цену и расписание — закрытые
        // месяцы фиксируем по прежней группе
        await this.ledger.freezeClosedMonths({ studentId, courseId: group.courseId });
        await this.prisma.enrollment.update({
          where: { studentId_courseId: { studentId, courseId: group.courseId } },
          data: { groupId },
        });
      } else {
        await this.prisma.enrollment.create({
          data: { studentId, courseId: group.courseId, groupId },
        });
      }
    }

    return { added: eligible.length };
  }

  /**
   * Убрать из группы. По умолчанию студент остаётся на курсе — но уже без
   * расписания, и неполный месяц ему считается по календарным дням. Поэтому
   * администратор выбирает: снять только группу или отчислить совсем.
   */
  async removeStudent(groupId: string, studentId: string, alsoUnenroll: boolean, ability: AppAbility, actor: SessionUser) {
    const group = await this.manageableGroup(ability, groupId);

    if (alsoUnenroll) {
      // Запись удаляется целиком: начисления прекращаются. Принятые оплаты
      // остаются — они привязаны к паре студент+курс, а не к записи.
      await this.prisma.enrollment.delete({
        where: { studentId_courseId: { studentId, courseId: group.courseId } },
      });
    } else {
      // Запись остаётся без группы — теряет её цену и расписание, поэтому
      // закрытые месяцы фиксируем по нынешней группе
      await this.ledger.freezeClosedMonths({ studentId, courseId: group.courseId });
      await this.prisma.enrollment.update({
        where: { studentId_courseId: { studentId, courseId: group.courseId } },
        data: { groupId: null },
      });
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "Enrollment",
      entityId: `${studentId}:${group.courseId}`,
      action: alsoUnenroll ? "DELETE" : "UPDATE",
      metadata: { groupId, alsoUnenroll },
    });
    return { studentId, alsoUnenroll };
  }

  async moveStudent(toGroupId: string, studentId: string, courseId: string, ability: AppAbility) {
    await this.manageableGroup(ability, toGroupId);

    // Новая группа — новая цена и расписание: сначала фиксируем закрытые
    // месяцы по старой, иначе перевод в октябре переписал бы сентябрь
    await this.ledger.freezeClosedMonths({ studentId, courseId });

    await this.prisma.enrollment.update({
      where: { studentId_courseId: { studentId, courseId } },
      data: { groupId: toGroupId },
    });
    return { studentId, toGroupId };
  }

  /** Записанные на курс, но без группы. */
  async ungroupedStudents(courseId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, groupId: null },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true },
        },
      },
    });
    return enrollments.map((enrollment) => enrollment.student);
  }

  /**
   * Кого можно добавить в группу: все активные ученики, кроме уже состоящих в
   * ней. Выбор не ограничен записанными на курс — запись создаёт добавление.
   */
  async availableStudents(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { courseId: true },
    });
    if (!group) throw new NotFoundException("groupNotFound");

    const students = await this.prisma.user.findMany({
      where: { role: "STUDENT", isActive: true, NOT: { enrollments: { some: { groupId } } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        enrollments: {
          where: { courseId: group.courseId },
          select: { group: { select: { name: true } } },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return students.map((student) => {
      const enrollment = student.enrollments[0];
      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        // Уже на курсе? В какой группе? Это меняет смысл добавления:
        // запись, перевод из другой группы или просто привязка к группе.
        enrolled: Boolean(enrollment),
        currentGroup: enrollment?.group?.name ?? null,
      };
    });
  }

  /** Кандидаты в преподаватели группы: активные TEACHER или ADMIN. */
  teacherOptions() {
    return this.prisma.user.findMany({
      // ADMIN включён намеренно: в небольшом центре занятия нередко ведёт
      // сам администратор, и без него список окажется пустым.
      where: { role: { in: ["TEACHER", "ADMIN"] }, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }

  /** Группа, которой вызывающий вправе управлять. Чужая — 404. */
  private async manageableGroup(ability: AppAbility, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { AND: [accessibleWhere<Prisma.GroupWhereInput>(ability, "Group", "update"), { id: groupId }] },
      select: { id: true, name: true, courseId: true, isActive: true, price: true, startDate: true, endDate: true, scheduleDays: true, teacherId: true, description: true, schedule: true, sortOrder: true },
    });
    if (!group) throw new NotFoundException("groupNotFound");
    return group;
  }

  private async manageableCourse(ability: AppAbility, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [accessibleWhere<Prisma.CourseWhereInput>(ability, "Course", "update"), { id: courseId }] },
      select: { id: true, teacherId: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");
    return course;
  }
}

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { dateInputToDb, toNoonUtc } from "../../common/date-only";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Prisma } from "../../../generated/prisma";
import { BillingLedgerService } from "../billing/billing-ledger.service";
import { SalaryService } from "../salary/salary.service";
import type { CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";

/** Перенесено из src/actions/group-actions.ts в web. */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: BillingLedgerService,
    private readonly salary: SalaryService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Группы курса: порядок задаёт sortOrder. */
  byCourse(courseId: string) {
    return this.prisma.group.findMany({
      where: { courseId },
      include: { branch: { select: { id: true, name: true } }, _count: { select: { enrollments: true } } },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * Все группы. Преподавателю — только по его курсам: это раскладка раздела
   * «Группы», как было до переноса. branchId — необязательный фильтр списка.
   */
  all(user: SessionUser, branchId?: string) {
    return this.prisma.group.findMany({
      where: {
        ...(user.role === "TEACHER" ? { course: { teacherId: user.id } } : {}),
        ...(branchId ? { branchId } : {}),
      },
      include: {
        course: { select: { id: true, slug: true, title: true } },
        branch: { select: { id: true, name: true } },
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
        branch: { select: { id: true, name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          include: {
            student: {
              // Логин вместо почты (шаг 1 отказа от почты), telegramUsername —
              // для кнопки «Написать в Telegram» на составе группы (4.2)
              select: {
                id: true,
                firstName: true,
                lastName: true,
                login: true,
                phone: true,
                isActive: true,
                telegramUsername: true,
              },
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

    const branch = await this.prisma.branch.findUnique({ where: { id: data.branchId }, select: { id: true } });
    if (!branch) throw new NotFoundException("branchNotFound");

    const existing = await this.prisma.group.findUnique({
      where: { courseId_branchId_name: { courseId: course.id, branchId: data.branchId, name: data.name } },
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
        // Пустая строка — ставки у группы нет, зарплата берёт ставку
        // преподавателя (план зарплат, 5.2)
        salaryPercentBp:
          data.salaryPercentBp === "" || data.salaryPercentBp === undefined ? null : data.salaryPercentBp,
        // Даты группы двигают начисления, поэтому нормализуем их к полудню UTC —
        // как startsAt у записи и paidAt у оплаты
        startDate: dateInputToDb(data.startDate) ?? null,
        endDate: dateInputToDb(data.endDate) ?? null,
        courseId: course.id,
        branchId: data.branchId,
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

    // Ключ уникальности — (courseId, branchId, name): «Python-1» разрешена в
    // каждом филиале. Проверяем, если меняется хоть одна часть ключа.
    const nextBranchId = data.branchId ?? group.branchId;
    const nextName = data.name ?? group.name;
    if (nextBranchId !== group.branchId || nextName !== group.name) {
      if (data.branchId !== undefined) {
        const branch = await this.prisma.branch.findUnique({ where: { id: data.branchId }, select: { id: true } });
        if (!branch) throw new NotFoundException("branchNotFound");
      }
      const existing = await this.prisma.group.findUnique({
        where: { courseId_branchId_name: { courseId: group.courseId, branchId: nextBranchId, name: nextName } },
        select: { id: true },
      });
      if (existing) throw new ConflictException("groupNameExists");
    }

    // Цена, даты и расписание группы — входы начисления. Закрытые месяцы
    // окончательны, но заморозка ленивая: фиксируем их ДО записи, иначе
    // месяц, который ещё никто не открывал, заморозился бы по новым данным
    await this.ledger.freezeClosedMonths({ groupId });
    // Зарплата опирается на начисления — её заморозка идёт СТРОГО ПОСЛЕ
    // биллинговой (план зарплат, 5.4). Тот же вызов покрывает и педагога, и
    // цену/расписание, и salaryPercentBp — все они меняются здесь же.
    await this.salary.freezeClosedMonths({ groupId });

    const updated = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.branchId !== undefined && { branchId: data.branchId }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.schedule !== undefined && { schedule: data.schedule }),
        ...(data.scheduleDays !== undefined && { scheduleDays: data.scheduleDays }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        // undefined — не трогаем, "" — убираем цену группы
        price: data.price === undefined ? undefined : data.price === "" ? null : data.price,
        // undefined — не трогаем, "" — снимаем ставку группы (берётся ставка преподавателя)
        salaryPercentBp:
          data.salaryPercentBp === undefined ? undefined : data.salaryPercentBp === "" ? null : data.salaryPercentBp,
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
    // И зарплату преподавателя группы — ДО удаления строки Group: после
    // delete() педагога и ставку группы взять будет неоткуда (план, 5.4)
    await this.salary.freezeClosedMonths({ groupId });

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
        select: { id: true, groupId: true, unenrolledAt: true },
      });

      if (existing) {
        // Перевод из другой группы меняет цену и расписание — закрытые
        // месяцы фиксируем по прежней группе. Тот же вызов фиксирует и
        // разрыв отчисленного — по СТАРЫМ (ещё с billingEndsAt) данным, до
        // того как мы его ниже снимем
        await this.ledger.freezeClosedMonths({ studentId, courseId: group.courseId });
        // База ПРЕЖНЕЙ группы (или записей без группы, если existing.groupId
        // пуст) теряет этого студента — фиксируем её зарплату ДО перевода,
        // иначе закрытый месяц пересчитается уже без его начислений
        await this.salary.freezeClosedMonths({ groupId: existing.groupId, courseId: group.courseId });
        await this.prisma.enrollment.update({
          where: { studentId_courseId: { studentId, courseId: group.courseId } },
          data: {
            groupId,
            // Возвращаем в группу отчисленного — начисления и доступ
            // возобновляются с сегодня; разрыв уже заморожен строкой выше
            ...(existing.unenrolledAt !== null && { unenrolledAt: null, billingEndsAt: null }),
          },
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
    // Удалили ли строку физически — решает, что писать в журнал ниже
    let deleted = false;

    if (alsoUnenroll) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId: group.courseId } },
        select: { id: true },
      });
      if (!enrollment) throw new NotFoundException("enrollmentNotFound");

      // Собственные закрытые месяцы записи фиксируем ДО отчисления: ленивая
      // заморозка иначе посчитала бы ещё не зафиксированный месяц уже с
      // billingEndsAt ниже — ровно то, от чего реестр защищает всегда
      await this.ledger.freezeClosedMonths({ enrollmentId: enrollment.id });
      // Зарплата группы — строго после биллинговой заморозки (план зарплат,
      // 5.4) и до изменения записи: иначе её база за закрытые месяцы задним
      // числом уменьшится на этого студента — ровно то, от чего
      // TeacherSalaryAccrual хранит собственный снимок.
      await this.salary.freezeClosedMonths({ groupId });

      // Заводили по ошибке (ни начислений, ни оплат) — можно стереть, как
      // раньше. Иначе запись хранит платёжную историю (аудит билинга:
      // отчисление стирало её вместе с MonthlyCharge через Cascade) —
      // трогать её физически нельзя.
      const [chargesCount, paymentsCount] = await Promise.all([
        this.prisma.monthlyCharge.count({ where: { enrollmentId: enrollment.id } }),
        this.prisma.payment.count({ where: { studentId, courseId: group.courseId, deletedAt: null } }),
      ]);

      if (chargesCount === 0 && paymentsCount === 0) {
        await this.prisma.enrollment.delete({ where: { id: enrollment.id } });
        deleted = true;
      } else {
        // История есть — запись остаётся: снимаем группу, ставим дату
        // отчисления (начисления дальше не идут — chargeForMonth сама
        // учитывает billingEndsAt) и unenrolledAt (доступ к курсу закрывает
        // им, а не связкой groupId+billingEndsAt — см. комментарий у поля в
        // schema.prisma). Принятые оплаты никуда не денутся — они привязаны
        // к паре студент+курс, а не к записи.
        const now = toNoonUtc(new Date().toISOString().slice(0, 10));
        await this.prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { groupId: null, billingEndsAt: now, unenrolledAt: now },
        });
      }
    } else {
      // Запись остаётся без группы — теряет её цену и расписание, поэтому
      // закрытые месяцы фиксируем по нынешней группе
      await this.ledger.freezeClosedMonths({ studentId, courseId: group.courseId });
      await this.salary.freezeClosedMonths({ groupId });
      await this.prisma.enrollment.update({
        where: { studentId_courseId: { studentId, courseId: group.courseId } },
        data: { groupId: null },
      });
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "Enrollment",
      entityId: `${studentId}:${group.courseId}`,
      // Физическое удаление — только когда истории не было; иначе это
      // отчисление с сохранением записи (unenrolledAt), в журнале — UPDATE
      action: deleted ? "DELETE" : "UPDATE",
      metadata: { groupId, alsoUnenroll },
    });
    return { studentId, alsoUnenroll };
  }

  async moveStudent(toGroupId: string, studentId: string, courseId: string, ability: AppAbility) {
    await this.manageableGroup(ability, toGroupId);

    // Прежняя группа нужна, чтобы заморозить именно её зарплату — Enrollment
    // хранит только текущий groupId, после update() старую уже не узнать
    const current = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { groupId: true },
    });

    // Новая группа — новая цена и расписание: сначала фиксируем закрытые
    // месяцы по старой, иначе перевод в октябре переписал бы сентябрь
    await this.ledger.freezeClosedMonths({ studentId, courseId });
    // База ПРЕЖНЕЙ группы теряет этого студента — фиксируем её зарплату тоже,
    // строго после биллинговой заморозки (план зарплат, 5.4)
    await this.salary.freezeClosedMonths({ groupId: current?.groupId ?? null, courseId });

    await this.prisma.enrollment.update({
      where: { studentId_courseId: { studentId, courseId } },
      data: { groupId: toGroupId },
    });
    return { studentId, toGroupId };
  }

  /** Записанные на курс, но без группы. Отчисленные (unenrolledAt) сюда не входят. */
  async ungroupedStudents(courseId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, groupId: null, unenrolledAt: null },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            login: true,
            phone: true,
            isActive: true,
            telegramUsername: true,
          },
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
        login: true,
        phone: true,
        telegramUsername: true,
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
        login: student.login,
        phone: student.phone,
        telegramUsername: student.telegramUsername,
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
      select: { id: true, name: true, courseId: true, branchId: true, isActive: true, price: true, startDate: true, endDate: true, scheduleDays: true, teacherId: true, description: true, schedule: true, sortOrder: true },
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

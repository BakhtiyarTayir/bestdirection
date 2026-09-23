import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { Prisma } from "../../../generated/prisma";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import { generateUniqueLogin, loginBaseFromName } from "../../common/auth/login-generator";
import { SessionsService } from "../../common/auth/sessions.service";
import { SessionUserCache } from "../../common/auth/session-user.cache";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingLedgerService } from "../billing/billing-ledger.service";
import { SalaryService } from "../salary/salary.service";
import type { CreateUserDto, UpdateProfileDto, UpdateUserDto } from "./dto/user.dto";

const USER_SELECT = {
  id: true,
  number: true,
  login: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  branchId: true,
  branch: { select: { id: true, name: true } },
  // Для кнопки «Написать в Telegram» на карточках других людей (4.2)
  telegramUsername: true,
  // Ставка преподавателя — нужна форме правки, чтобы показать текущее
  // значение. Для STUDENT/PARENT/ADMIN поле просто пустое.
  salaryPercentBp: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly sessionUsers: SessionUserCache,
    private readonly sessions: SessionsService,
    private readonly salary: SalaryService,
    private readonly ledger: BillingLedgerService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Без фильтра мягкого удаления: логин удалённого пользователя остаётся занятым. */
  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  list(ability: AppAbility, branchId?: string) {
    // Кого видно, решают правила: администратор — всех, преподаватель —
    // учеников и себя. Раньше это был ручной if по роли внутри действия.
    // Фильтр здесь — по «домашнему» branchId пользователя: для списка
    // персонала (в отличие от студентов-должников) это справочная приписка,
    // а не привязка через группу.
    return this.prisma.user.findMany({
      where: {
        AND: [accessibleWhere<Prisma.UserWhereInput>(ability, "User"), ...(branchId ? [{ branchId }] : [])],
      },
      orderBy: { createdAt: "desc" },
      select: USER_SELECT,
    });
  }

  async byId(ability: AppAbility, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { AND: [accessibleWhere<Prisma.UserWhereInput>(ability, "User"), { id }] },
      select: USER_SELECT,
    });
    // Недоступный объект — 404, а не 403: иначе ответ подтверждает, что такой
    // пользователь существует.
    if (!user) throw new NotFoundException("userNotFound");
    return user;
  }

  async create(data: CreateUserDto, actor: SessionUser) {
    if (await this.loginTakenBy(data.login)) throw new ConflictException("loginExists");

    const branchId = data.branchId.trim();
    if (!(await this.branchExists(branchId))) throw new NotFoundException("branchNotFound");

    // Блок «Обучение» (4.4–4.6): проверяем курс/группу/филиал ДО транзакции,
    // чтобы не заводить пользователя, а потом откатывать его создание из-за
    // ошибки в данных о курсе
    if (data.enrollment) {
      await this.assertEnrollable(data.enrollment, branchId);
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            login: data.login,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            role: data.role,
            branchId,
          },
          select: USER_SELECT,
        });

        // Пользователь и запись на курс создаются вместе или не создаются
        // вовсе: без транзакции падение второго шага оставило бы ученика без
        // обучения — ровно ту дыру в трёх разрозненных экранах, которую этот
        // блок и закрывает (план, 4.4)
        let enrollmentId: string | null = null;
        if (data.enrollment && data.role === "STUDENT") {
          const enrollment = await tx.enrollment.create({
            data: {
              studentId: user.id,
              courseId: data.enrollment.courseId,
              groupId: data.enrollment.groupId || null,
              priceOverride: data.enrollment.priceOverride ?? null,
              startsAt: data.enrollment.startsAt ? toNoonUtc(data.enrollment.startsAt) : null,
              firstMonthCharge: data.enrollment.firstMonthCharge ?? null,
            },
            select: { id: true },
          });
          enrollmentId = enrollment.id;
        }

        return { ...user, enrollmentId };
      });
    } catch (error) {
      // Гонка: между проверкой и вставкой логин мог занять другой администратор
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("loginExists");
      }
      throw error;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "User",
      entityId: created.id,
      action: "CREATE",
      metadata: { login: created.login, role: created.role, enrollmentId: created.enrollmentId },
    });
    return created;
  }

  /** Свободный логин из имени и фамилии — для кнопки «Сгенерировать» в форме. */
  async suggestLogin(firstName: string, lastName: string): Promise<{ login: string }> {
    const login = await generateUniqueLogin(this.prismaUnscoped, loginBaseFromName(firstName, lastName));
    return { login };
  }

  async loginAvailable(login: string): Promise<{ available: boolean }> {
    return { available: !(await this.loginTakenBy(login)) };
  }

  /** Курсы и их группы для блока «Обучение» в форме создания ученика (4.4). */
  async formOptionsForCreate() {
    const [courses, groups] = await Promise.all([
      this.prisma.course.findMany({
        where: { deletedAt: null },
        select: { id: true, title: true, price: true },
        orderBy: { title: "asc" },
      }),
      this.prisma.group.findMany({
        where: { isActive: true, course: { deletedAt: null } },
        select: { id: true, name: true, price: true, courseId: true, branchId: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { courses, groups };
  }

  /**
   * Курс — не в Корзине, группа (если выбрана) принадлежит этому курсу и
   * заведена в том же филиале, что и ученик — иначе он окажется в группе
   * «Python-1» чужого филиала (ловушка 3.8.1 плана филиалов: имя группы
   * уникально внутри филиала, поэтому groupId сам по себе не гарантирует
   * совпадение).
   */
  private async assertEnrollable(
    enrollment: NonNullable<CreateUserDto["enrollment"]>,
    branchId: string
  ): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id: enrollment.courseId, deletedAt: null },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");

    if (enrollment.groupId) {
      const group = await this.prisma.group.findFirst({
        where: { id: enrollment.groupId, courseId: enrollment.courseId },
        select: { id: true, branchId: true },
      });
      if (!group) throw new NotFoundException("groupNotFound");
      if (group.branchId !== branchId) throw new BadRequestException("groupWrongBranch");
    }
  }

  async update(id: string, data: UpdateUserDto, actor: SessionUser) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        login: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        branchId: true,
        salaryPercentBp: true,
      },
    });
    if (!existing) throw new NotFoundException("userNotFound");

    if (data.login) {
      const holderId = await this.loginTakenBy(data.login);
      if (holderId && holderId !== id) throw new ConflictException("loginExists");
    }

    // undefined — не трогаем, пустая строка — очищаем приписку к филиалу
    const branchId = data.branchId !== undefined ? data.branchId.trim() || null : undefined;
    if (branchId && !(await this.branchExists(branchId))) throw new NotFoundException("branchNotFound");

    const losesAdmin =
      existing.role === "ADMIN" &&
      ((data.role !== undefined && data.role !== "ADMIN") || data.isActive === false);
    if (losesAdmin) await this.assertNotLastAdmin(id);

    // Сброс пароля администратором (4.1, «Путь 1»): выдаём новый хэш, тот же
    // приём, что уже применяется для деактивации ниже — сброс кэша сессии и
    // разрыв всех текущих сессий, иначе чужой доступ пережил бы смену пароля
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;

    // Ставка преподавателя — вход расчёта зарплаты (как цена курса в
    // биллинге). Меняем только вперёд: закрытые месяцы фиксируем ДО записи,
    // иначе ещё не открытый месяц заморозился бы уже по новой ставке
    // (план зарплат, 5.4). Затрагивает ВСЕ единицы этого преподавателя —
    // все его группы без своей ставки и все его курсы без группы.
    if (data.salaryPercentBp !== undefined && data.salaryPercentBp !== existing.salaryPercentBp) {
      await this.salary.freezeClosedMonths({ teacherId: id });
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.login && { login: data.login }),
        ...(passwordHash && { passwordHash }),
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(branchId !== undefined && { branchId }),
        ...(data.salaryPercentBp !== undefined && { salaryPercentBp: data.salaryPercentBp }),
      },
      select: USER_SELECT,
    });

    // Роль и активность guard берёт из БД, но у него кэш на 30 секунд —
    // сбрасываем, чтобы изменение подействовало сразу (аудит 2.1)
    this.sessionUsers.forget(id);
    if (data.isActive === false || passwordHash) await this.sessions.destroyAllFor(id);

    const changes = computeChanges(existing, { ...data, password: data.password ? "***" : undefined });
    if (changes) {
      await this.audit.record({
        userId: actor.id,
        entityType: "User",
        entityId: id,
        action: "UPDATE",
        changes,
      });
    }
    return user;
  }

  /**
   * Вкладка «Деактивированные». Мимо фильтра мягкого удаления: кроме выключенных
   * сюда попадают записи с deletedAt от старой логики удаления — иначе они
   * остались бы невидимыми навсегда.
   */
  deactivated() {
    return this.prismaUnscoped.user.findMany({
      where: { OR: [{ isActive: false }, { deletedAt: { not: null } }] },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        number: true,
        login: true,
        firstName: true,
        lastName: true,
        role: true,
        telegramChatId: true,
      },
    });
  }

  async deactivate(id: string, actor: SessionUser) {
    if (actor.id === id) throw new BadRequestException("cannotDeactivateSelf");
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new NotFoundException("userNotFound");
    if (target.role === "ADMIN") await this.assertNotLastAdmin(id);

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    this.sessionUsers.forget(id);
    // Выключенный аккаунт не должен доживать смену на открытой вкладке
    await this.sessions.destroyAllFor(id);

    // Ученик деактивирован — долг больше не должен расти: billing-ledger
    // отсеивает только deletedAt, isActive: false его не останавливает (иначе
    // не выключить бы ученика на время паузы и вернуть начисления назад).
    // Останавливаем начисления явно — той же датой, что «Убрать из группы»
    // без отчисления (groups.service.ts removeStudent).
    if (target.role === "STUDENT") await this.stopBillingForStudent(id, actor);

    await this.audit.record({
      userId: actor.id,
      entityType: "User",
      entityId: id,
      action: "UPDATE",
      metadata: { deactivated: true },
    });
  }

  /**
   * Ставит billingEndsAt на сегодня всем ещё не завершённым записям ученика.
   * unenrolledAt НЕ трогаем: деактивация — это не отчисление, а пауза; при
   * восстановлении (restore) начисления сами не возобновятся — администратор
   * снимет дату окончания в диалоге начислений, как и после обычной паузы.
   */
  private async stopBillingForStudent(studentId: string, actor: SessionUser) {
    const today = toNoonUtc(new Date().toISOString().slice(0, 10));

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, OR: [{ billingEndsAt: null }, { billingEndsAt: { gt: today } }] },
      select: { id: true, groupId: true, courseId: true, billingEndsAt: true },
    });
    if (enrollments.length === 0) return;

    // Реестр начислений — ПЕРЕД зарплатой (правило проекта): сначала
    // фиксируем закрытые месяцы учеников, потом — зарплату преподавателей,
    // которая на них опирается. Один вызов на всего студента — дешевле, чем
    // по одному на запись, и ledger сам разберётся по своим записям.
    await this.ledger.freezeClosedMonths({ studentId });
    for (const enrollment of enrollments) {
      // groupId различает «по конкретной группе» и «без группы» (undefined
      // тут не подходит — он значит «без фильтра по группе» для SalaryService)
      await this.salary.freezeClosedMonths(
        enrollment.groupId
          ? { groupId: enrollment.groupId }
          : { groupId: null, courseId: enrollment.courseId }
      );
    }

    for (const enrollment of enrollments) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { billingEndsAt: today },
      });
      await this.audit.record({
        userId: actor.id,
        entityType: "Enrollment",
        entityId: enrollment.id,
        action: "UPDATE",
        metadata: { deactivated: true },
        changes: { billingEndsAt: { old: enrollment.billingEndsAt, new: today } },
      });
    }
  }

  /** deletedAt снимаем заодно: у записей, удалённых старой логикой, он остался. */
  async restore(id: string, actor: SessionUser) {
    const existing = await this.prismaUnscoped.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("userNotFound");

    await this.prisma.user.update({ where: { id }, data: { isActive: true, deletedAt: null } });
    this.sessionUsers.forget(id);

    await this.audit.record({
      userId: actor.id,
      entityType: "User",
      entityId: id,
      action: "UPDATE",
      metadata: { restored: true },
    });
  }

  /**
   * Полное удаление строки. Освобождает логин и telegramChatId и каскадом
   * уносит то, что на пользователя завязано, — кроме денежной истории
   * (принятые платежи, начисления и выплаты зарплаты на RESTRICT, см. ниже):
   * её удаление блокируется, а не стирается вместе с пользователем.
   */
  async purge(id: string, actor: SessionUser) {
    if (actor.id === id) throw new BadRequestException("cannotPurgeSelf");

    const target = await this.prismaUnscoped.user.findUnique({
      where: { id },
      select: { id: true, isActive: true, deletedAt: true, login: true, role: true, firstName: true, lastName: true },
    });
    if (!target) throw new NotFoundException("userNotFound");
    // Стирать можно только с вкладки деактивированных
    if (target.isActive && !target.deletedAt) throw new BadRequestException("userIsActive");
    if (target.role === "ADMIN") await this.assertNotLastAdmin(id);

    try {
      // Мимо расширения мягкого удаления: нужна именно строка, а не deletedAt
      await this.prismaUnscoped.user.delete({ where: { id } });
    } catch (error) {
      // Часть связей на RESTRICT: курсы преподавателя, принятые платежи, рассылки
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException("userHasProtectedRecords");
      }
      throw error;
    }
    this.sessionUsers.forget(id);

    // Журнал пишем после удаления: записи самого пользователя каскад унёс,
    // а эта принадлежит администратору и останется
    await this.audit.record({
      userId: actor.id,
      entityType: "User",
      entityId: id,
      action: "DELETE",
      metadata: {
        permanent: true,
        login: target.login,
        role: target.role,
        name: `${target.firstName} ${target.lastName}`,
      },
    });
  }

  /**
   * Преподаватели с нагрузкой: какие группы ведут и какие курсы за ними
   * закреплены.
   */
  async teachers() {
    const teachers = await this.prisma.user.findMany({
      where: { role: "TEACHER" },
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        login: true,
        phone: true,
        isActive: true,
        telegramUsername: true,
        taughtGroups: {
          where: { course: { deletedAt: null } },
          select: {
            id: true,
            name: true,
            course: { select: { title: true } },
            _count: { select: { enrollments: true } },
          },
          orderBy: { name: "asc" },
        },
        courses: {
          where: { deletedAt: null },
          select: { id: true, title: true, slug: true },
          orderBy: { title: "asc" },
        },
      },
    });

    return teachers.map((teacher) => ({
      id: teacher.id,
      number: teacher.number,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      login: teacher.login,
      phone: teacher.phone,
      isActive: teacher.isActive,
      telegramUsername: teacher.telegramUsername,
      groups: teacher.taughtGroups.map((group) => ({
        id: group.id,
        name: group.name,
        courseTitle: group.course.title,
        studentCount: group._count.enrollments,
      })),
      courses: teacher.courses,
      studentCount: teacher.taughtGroups.reduce((sum, group) => sum + group._count.enrollments, 0),
    }));
  }

  updateProfile(userId: string, data: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { firstName: data.firstName, lastName: data.lastName, phone: data.phone },
      select: { id: true, login: true, firstName: true, lastName: true, phone: true, role: true },
    });
  }

  async changePassword(userId: string, data: { currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException("userNotFound");

    // У Telegram-аккаунтов пароля может не быть — тогда его задают сразу
    if (user.passwordHash) {
      const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!isValid) throw new BadRequestException("currentPasswordIncorrect");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(data.newPassword, 10) },
    });
  }

  /** Уникальный индекс про deletedAt не знает: логин держит занятым любая строка, в том числе невидимая обычному клиенту. */
  private async loginTakenBy(login: string): Promise<string | null> {
    const holder = await this.prismaUnscoped.user.findUnique({ where: { login }, select: { id: true } });
    return holder?.id ?? null;
  }

  private async branchExists(id: string): Promise<boolean> {
    return (await this.prisma.branch.findUnique({ where: { id }, select: { id: true } })) !== null;
  }

  /** Единственный администратор не может разжаловать, выключить или стереть себя (аудит 3.7). */
  private async assertNotLastAdmin(id: string) {
    const otherAdmins = await this.prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherAdmins === 0) throw new BadRequestException("lastAdmin");
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { Prisma } from "../../../generated/prisma";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import { SessionsService } from "../../common/auth/sessions.service";
import { SessionUserCache } from "../../common/auth/session-user.cache";
import type { SessionUser } from "../../common/auth/session-user";
import { accessibleWhere, type AppAbility } from "../../common/policies/abilities";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { CreateUserDto, UpdateProfileDto, UpdateUserDto } from "./dto/user.dto";

const USER_SELECT = {
  id: true,
  number: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly sessionUsers: SessionUserCache,
    private readonly sessions: SessionsService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Без фильтра мягкого удаления: почта удалённого пользователя остаётся занятой. */
  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  list(ability: AppAbility) {
    // Кого видно, решают правила: администратор — всех, преподаватель —
    // учеников и себя. Раньше это был ручной if по роли внутри действия.
    return this.prisma.user.findMany({
      where: accessibleWhere<Prisma.UserWhereInput>(ability, "User"),
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
    // Почта необязательна (офлайн-ученики без входа по почте). Пустая строка →
    // null, иначе уникальный индекс словит коллизию по "".
    const email = data.email?.trim() ? data.email.trim() : null;
    if (email && (await this.emailTakenBy(email))) throw new ConflictException("emailExists");

    const passwordHash = await bcrypt.hash(data.password, 10);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: data.role,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      // Гонка: между проверкой и вставкой почту мог занять другой администратор
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("emailExists");
      }
      throw error;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "User",
      entityId: user.id,
      action: "CREATE",
      metadata: { email: user.email, role: user.role },
    });
    return user;
  }

  async update(id: string, data: UpdateUserDto, actor: SessionUser) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true },
    });
    if (!existing) throw new NotFoundException("userNotFound");

    // undefined — поле не меняем, пустая строка — стираем почту
    const email = data.email !== undefined ? data.email.trim() || null : undefined;
    if (email) {
      const holderId = await this.emailTakenBy(email);
      if (holderId && holderId !== id) throw new ConflictException("emailExists");
    }

    const losesAdmin =
      existing.role === "ADMIN" &&
      ((data.role !== undefined && data.role !== "ADMIN") || data.isActive === false);
    if (losesAdmin) await this.assertNotLastAdmin(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(email !== undefined && { email }),
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: USER_SELECT,
    });

    // Роль и активность guard берёт из БД, но у него кэш на 30 секунд —
    // сбрасываем, чтобы изменение подействовало сразу (аудит 2.1)
    this.sessionUsers.forget(id);
    if (data.isActive === false) await this.sessions.destroyAllFor(id);

    const changes = computeChanges(existing, { ...data });
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
        email: true,
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

    await this.audit.record({
      userId: actor.id,
      entityType: "User",
      entityId: id,
      action: "UPDATE",
      metadata: { deactivated: true },
    });
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
   * Полное удаление строки. Освобождает почту и telegramChatId и каскадом
   * уносит всё, что на пользователя завязано.
   */
  async purge(id: string, actor: SessionUser) {
    if (actor.id === id) throw new BadRequestException("cannotPurgeSelf");

    const target = await this.prismaUnscoped.user.findUnique({
      where: { id },
      select: { id: true, isActive: true, deletedAt: true, email: true, role: true, firstName: true, lastName: true },
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
        email: target.email,
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
        email: true,
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
      email: teacher.email,
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
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true },
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

  private async emailTakenBy(email: string): Promise<string | null> {
    // Уникальный индекс про deletedAt не знает: почту держит занятой любая
    // строка, в том числе невидимая обычному клиенту
    const holder = await this.prismaUnscoped.user.findUnique({ where: { email }, select: { id: true } });
    return holder?.id ?? null;
  }

  /** Единственный администратор не может разжаловать, выключить или стереть себя (аудит 3.7). */
  private async assertNotLastAdmin(id: string) {
    const otherAdmins = await this.prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherAdmins === 0) throw new BadRequestException("lastAdmin");
  }
}

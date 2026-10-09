import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma";
import { AuditService } from "../../common/audit/audit.service";
import { generateUniqueLogin, loginBaseFromName } from "../../common/auth/login-generator";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { withHasTelegram } from "../../common/telegram/with-has-telegram";
import type { CreateParentDto, LinkParentDto, UpdateLinkDto } from "./dto/parent.dto";

const PARENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
} as const;

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
} as const;

/** Перенесено из src/actions/parent-actions.ts в web. */
@Injectable()
export class ParentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async byStudent(studentId: string) {
    const links = await this.prisma.parentStudent.findMany({
      where: { studentId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        relation: true,
        isPrimary: true,
        createdAt: true,
        // telegramChatId — только для признака hasTelegram у кнопки
        // «Пригласить в Telegram» (parents-panel.tsx), наружу сам id не идёт
        parent: { select: { ...PARENT_SELECT, telegramChatId: true } },
      },
    });
    return links.map((link) => ({ ...link, parent: withHasTelegram(link.parent) }));
  }

  /**
   * Дети родителя. Без аргумента — дети текущего пользователя: это путь
   * кабинета родителя. Чужую семью читает только персонал.
   */
  async children(requestedParentId: string | undefined, user: SessionUser) {
    const targetId = requestedParentId ?? user.id;
    if (targetId !== user.id && user.role !== "ADMIN" && user.role !== "TEACHER") {
      throw new NotFoundException("parentNotFound");
    }

    return this.prisma.parentStudent.findMany({
      where: { parentId: targetId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        relation: true,
        isPrimary: true,
        student: {
          select: {
            ...STUDENT_SELECT,
            enrollments: {
              select: {
                course: { select: { id: true, title: true, slug: true } },
                group: { select: { id: true, name: true, schedule: true } },
              },
            },
          },
        },
      },
    });
  }

  /** Уже заведённые родители — чтобы привязать второго ребёнка к тому же контакту. */
  async searchCandidates(query: string) {
    const q = query.trim();
    if (q.length < 2) return [];

    return this.prisma.user.findMany({
      where: {
        role: "PARENT",
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: { ...PARENT_SELECT, _count: { select: { childLinks: true } } },
      take: 10,
      orderBy: { lastName: "asc" },
    });
  }

  async link(data: LinkParentDto, actor: SessionUser) {
    if (data.parentId === data.studentId) throw new BadRequestException("parentCannotBeOwnChild");

    const [parent, student] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: data.parentId }, select: { id: true, role: true } }),
      this.prisma.user.findUnique({ where: { id: data.studentId }, select: { id: true, role: true } }),
    ]);

    if (!parent || !student) throw new NotFoundException("userNotFound");
    if (parent.role !== "PARENT") throw new BadRequestException("notAParent");
    if (student.role !== "STUDENT") throw new BadRequestException("notAStudent");

    const existing = await this.prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId: data.parentId, studentId: data.studentId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("linkAlreadyExists");

    // Основной контакт у ученика ровно один: снимаем флаг с остальных
    // в той же транзакции, иначе СМС уйдёт двоим.
    const link = await this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.parentStudent.updateMany({
          where: { studentId: data.studentId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.parentStudent.create({
        data: {
          parentId: data.parentId,
          studentId: data.studentId,
          relation: data.relation ?? "OTHER",
          isPrimary: data.isPrimary ?? false,
        },
        select: { id: true },
      });
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "ParentStudent",
      entityId: link.id,
      action: "CREATE",
      metadata: { parentId: data.parentId, studentId: data.studentId, relation: data.relation },
    });
    return link;
  }

  /** Заводит нового пользователя-родителя и сразу привязывает его к ученику. */
  async createForStudent(data: CreateParentDto, actor: SessionUser) {
    const student = await this.prisma.user.findUnique({
      where: { id: data.studentId },
      select: { id: true, role: true },
    });
    if (!student) throw new NotFoundException("userNotFound");
    if (student.role !== "STUDENT") throw new BadRequestException("notAStudent");

    // Логин обязателен (login NOT NULL) — у родителя своей формы логина нет,
    // он генерируется так же, как в форме создания пользователя
    const login = await generateUniqueLogin(
      this.prismaService.prismaUnscoped,
      loginBaseFromName(data.firstName, data.lastName)
    );

    // Пароль случайный: родителя заводит администратор, вход — через Telegram
    // или восстановление пароля по нему (сброс кодом в Telegram). Пустой
    // passwordHash оставлять нельзя, иначе форма входа сравнивает с null.
    const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const parent = await tx.user.create({
          data: {
            login,
            passwordHash,
            // Родитель — не ученик: обратимого пароля не храним
            passwordEnc: null,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            role: "PARENT",
          },
          select: PARENT_SELECT,
        });

        if (data.isPrimary) {
          await tx.parentStudent.updateMany({
            where: { studentId: data.studentId, isPrimary: true },
            data: { isPrimary: false },
          });
        }

        const link = await tx.parentStudent.create({
          data: {
            parentId: parent.id,
            studentId: data.studentId,
            relation: data.relation ?? "OTHER",
            isPrimary: data.isPrimary ?? false,
          },
          select: { id: true },
        });

        return { parent, link };
      });
    } catch (error) {
      // Гонка на логине: крайне маловероятна (генератор уже проверил
      // занятость), но точка входа публична для персонала — лучше понятная
      // ошибка, чем 500
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("loginExists");
      }
      throw error;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "User",
      entityId: result.parent.id,
      action: "CREATE",
      metadata: { role: "PARENT", linkedStudentId: data.studentId },
    });
    // Свежий родитель — Telegram точно не привязан, но форма ждёт то же
    // поле, что и byStudent (ApiParentLink["parent"])
    return { ...result.parent, hasTelegram: false };
  }

  async updateLink(id: string, data: UpdateLinkDto, actor: SessionUser) {
    const link = await this.prisma.parentStudent.findUnique({
      where: { id },
      select: { id: true, studentId: true },
    });
    if (!link) throw new NotFoundException("linkNotFound");

    await this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.parentStudent.updateMany({
          where: { studentId: link.studentId, isPrimary: true, id: { not: link.id } },
          data: { isPrimary: false },
        });
      }
      await tx.parentStudent.update({
        where: { id: link.id },
        data: { relation: data.relation, isPrimary: data.isPrimary },
      });
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "ParentStudent",
      entityId: link.id,
      action: "UPDATE",
      metadata: { relation: data.relation, isPrimary: data.isPrimary },
    });
    return { id: link.id };
  }

  /** Удаляет только связь. Сам родитель остаётся: у него могут быть другие дети. */
  async unlink(id: string, actor: SessionUser) {
    const link = await this.prisma.parentStudent.findUnique({
      where: { id },
      select: { id: true, parentId: true, studentId: true },
    });
    if (!link) throw new NotFoundException("linkNotFound");

    await this.prisma.parentStudent.delete({ where: { id } });

    await this.audit.record({
      userId: actor.id,
      entityType: "ParentStudent",
      entityId: id,
      action: "DELETE",
      metadata: { parentId: link.parentId, studentId: link.studentId },
    });
    return { id };
  }

  /**
   * Родители всех учеников группы — получатели рассылки. Дубли схлопываются:
   * один родитель с двумя детьми в группе получит одно СМС. Записи без
   * телефона возвращаются отдельно, чтобы администратор видел, до кого
   * сообщение не дойдёт, а не гадал по расхождению чисел.
   */
  async groupRecipients(groupId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { groupId },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((enrollment) => enrollment.studentId);
    if (studentIds.length === 0) return { recipients: [], withoutPhone: [], studentCount: 0 };

    const links = await this.prisma.parentStudent.findMany({
      where: { studentId: { in: studentIds }, parent: { deletedAt: null, isActive: true } },
      orderBy: [{ isPrimary: "desc" }],
      select: {
        relation: true,
        isPrimary: true,
        parent: { select: PARENT_SELECT },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const byParent = new Map<
      string,
      {
        parent: (typeof links)[number]["parent"];
        relation: (typeof links)[number]["relation"];
        isPrimary: boolean;
        children: { id: string; firstName: string; lastName: string }[];
      }
    >();

    for (const link of links) {
      const entry = byParent.get(link.parent.id);
      if (entry) {
        entry.children.push(link.student);
        entry.isPrimary = entry.isPrimary || link.isPrimary;
      } else {
        byParent.set(link.parent.id, {
          parent: link.parent,
          relation: link.relation,
          isPrimary: link.isPrimary,
          children: [link.student],
        });
      }
    }

    const all = [...byParent.values()];
    return {
      recipients: all.filter((entry) => entry.parent.phone?.trim()),
      withoutPhone: all.filter((entry) => !entry.parent.phone?.trim()),
      studentCount: studentIds.length,
    };
  }
}

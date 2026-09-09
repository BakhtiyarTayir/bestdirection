"use server";

import { prisma, prismaUnscoped } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { ParentRelation } from "@/validators/parent";

const PARENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  isActive: true,
} as const;

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
} as const;

/**
 * Ученики, к которым у пользователя есть доступ как у родителя.
 * Возвращает пустой массив для всех остальных ролей — вызывающий код
 * может смело использовать его в `where: { id: { in: ... } }`.
 */
export async function getAccessibleStudentIds(userId: string): Promise<string[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentId: userId },
    select: { studentId: true },
  });
  return links.map((l) => l.studentId);
}

// ---------- getStudentParents ----------
export async function getStudentParents(studentId: string) {
  return withAuth(
    async () => {
      const links = await prisma.parentStudent.findMany({
        where: { studentId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          relation: true,
          isPrimary: true,
          createdAt: true,
          parent: { select: PARENT_SELECT },
        },
      });

      return { success: true as const, data: links };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getParentChildren ----------
/**
 * Дети родителя. Без аргумента — дети текущего пользователя: это путь
 * кабинета родителя. С аргументом доступно только администратору и
 * преподавателю, иначе родитель мог бы читать чужие семьи.
 */
export async function getParentChildren(parentId?: string) {
  return withAuth(async (session) => {
    const targetId = parentId ?? session.user.id;

    if (targetId !== session.user.id && !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { success: false as const, error: "forbidden" };
    }

    const links = await prisma.parentStudent.findMany({
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

    return { success: true as const, data: links };
  });
}

// ---------- searchParentCandidates ----------
/** Уже заведённые родители — чтобы привязать второго ребёнка к тому же контакту. */
export async function searchParentCandidates(query: string) {
  return withAuth(
    async () => {
      const q = query.trim();
      if (q.length < 2) return { success: true as const, data: [] };

      const parents = await prisma.user.findMany({
        where: {
          role: "PARENT",
          deletedAt: null,
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

      return { success: true as const, data: parents };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- linkParent ----------
export async function linkParent(data: {
  parentId: string;
  studentId: string;
  relation?: ParentRelation;
  isPrimary?: boolean;
}) {
  return withAuth(
    async (session) => {
      if (data.parentId === data.studentId) {
        return { success: false as const, error: "parentCannotBeOwnChild" };
      }

      const [parent, student] = await Promise.all([
        prisma.user.findUnique({ where: { id: data.parentId }, select: { id: true, role: true } }),
        prisma.user.findUnique({ where: { id: data.studentId }, select: { id: true, role: true } }),
      ]);

      if (!parent || !student) return { success: false as const, error: "userNotFound" };
      if (parent.role !== "PARENT") return { success: false as const, error: "notAParent" };
      if (student.role !== "STUDENT") return { success: false as const, error: "notAStudent" };

      const existing = await prisma.parentStudent.findUnique({
        where: { parentId_studentId: { parentId: data.parentId, studentId: data.studentId } },
        select: { id: true },
      });
      if (existing) return { success: false as const, error: "linkAlreadyExists" };

      // Основной контакт у ученика ровно один: снимаем флаг с остальных
      // в той же транзакции, иначе СМС уйдёт двоим.
      const link = await prisma.$transaction(async (tx) => {
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

      await createAuditLog({
        userId: session.user.id,
        entityType: "ParentStudent",
        entityId: link.id,
        action: "CREATE",
        metadata: { parentId: data.parentId, studentId: data.studentId, relation: data.relation },
      });

      revalidateLocalized("/users");
      return { success: true as const, data: link };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- createParentForStudent ----------
/** Заводит нового пользователя-родителя и сразу привязывает его к ученику. */
export async function createParentForStudent(data: {
  studentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  relation?: ParentRelation;
  isPrimary?: boolean;
}) {
  return withAuth(
    async (session) => {
      const student = await prisma.user.findUnique({
        where: { id: data.studentId },
        select: { id: true, role: true },
      });
      if (!student) return { success: false as const, error: "userNotFound" };
      if (student.role !== "STUDENT") return { success: false as const, error: "notAStudent" };

      // Без soft-delete-фильтра: почту держит занятой любая строка в таблице,
      // в том числе деактивированная, — уникальный индекс про deletedAt и
      // isActive не знает, а обычный findUnique такую запись не показывает.
      const email = data.email?.trim() ? data.email.trim() : null;
      const emailTaken = email
        ? await prismaUnscoped.user.findUnique({
            where: { email },
            select: { id: true },
          })
        : null;
      if (emailTaken) {
        return { success: false as const, error: "emailAlreadyExists" };
      }

      // Пароль случайный: родителя заводит администратор, вход — через
      // Telegram или восстановление пароля по почте. Пустой passwordHash
      // оставлять нельзя, иначе форма входа сравнивает с null.
      const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);

      const result = await prisma.$transaction(async (tx) => {
        const parentData = {
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: "PARENT" as const,
        };

        const parent = await tx.user.create({
          data: { ...parentData, email },
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

      await createAuditLog({
        userId: session.user.id,
        entityType: "User",
        entityId: result.parent.id,
        action: "CREATE",
        metadata: { role: "PARENT", linkedStudentId: data.studentId },
      });

      revalidateLocalized("/users");
      return { success: true as const, data: result.parent };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- updateParentLink ----------
export async function updateParentLink(data: {
  id: string;
  relation?: ParentRelation;
  isPrimary?: boolean;
}) {
  return withAuth(
    async (session) => {
      const link = await prisma.parentStudent.findUnique({
        where: { id: data.id },
        select: { id: true, studentId: true },
      });
      if (!link) return { success: false as const, error: "linkNotFound" };

      await prisma.$transaction(async (tx) => {
        if (data.isPrimary) {
          await tx.parentStudent.updateMany({
            where: { studentId: link.studentId, isPrimary: true, id: { not: link.id } },
            data: { isPrimary: false },
          });
        }
        await tx.parentStudent.update({
          where: { id: link.id },
          data: {
            relation: data.relation,
            isPrimary: data.isPrimary,
          },
        });
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "ParentStudent",
        entityId: link.id,
        action: "UPDATE",
        metadata: { relation: data.relation, isPrimary: data.isPrimary },
      });

      revalidateLocalized("/users");
      return { success: true as const, data: { id: link.id } };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- unlinkParent ----------
/** Удаляет только связь. Сам пользователь-родитель остаётся: у него могут быть другие дети. */
export async function unlinkParent(id: string) {
  return withAuth(
    async (session) => {
      const link = await prisma.parentStudent.findUnique({
        where: { id },
        select: { id: true, parentId: true, studentId: true },
      });
      if (!link) return { success: false as const, error: "linkNotFound" };

      await prisma.parentStudent.delete({ where: { id } });

      await createAuditLog({
        userId: session.user.id,
        entityType: "ParentStudent",
        entityId: id,
        action: "DELETE",
        metadata: { parentId: link.parentId, studentId: link.studentId },
      });

      revalidateLocalized("/users");
      return { success: true as const, data: { id } };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getGroupParents ----------
/**
 * Родители всех учеников группы — получатели рассылки.
 * Дубли схлопываются: один родитель с двумя детьми в группе получит одно СМС.
 * Записи без телефона возвращаются отдельно, чтобы администратор видел,
 * до кого сообщение не дойдёт, а не гадал по расхождению чисел.
 */
export async function getGroupParents(groupId: string) {
  return withAuth(
    async () => {
      const enrollments = await prisma.enrollment.findMany({
        where: { groupId },
        select: { studentId: true },
      });
      const studentIds = enrollments.map((e) => e.studentId);
      if (studentIds.length === 0) {
        return { success: true as const, data: { recipients: [], withoutPhone: [], studentCount: 0 } };
      }

      const links = await prisma.parentStudent.findMany({
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
        success: true as const,
        data: {
          recipients: all.filter((r) => r.parent.phone?.trim()),
          withoutPhone: all.filter((r) => !r.parent.phone?.trim()),
          studentCount: studentIds.length,
        },
      };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

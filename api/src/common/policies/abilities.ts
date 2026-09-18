import { Ability, AbilityBuilder } from "@casl/ability";
import {
  accessibleBy,
  createPrismaAbility,
  type PrismaModel,
  type PrismaQueryOf,
  type Subjects,
} from "@casl/prisma/runtime";
import { Injectable } from "@nestjs/common";
import type { AuditLog, Prisma, User } from "../../../generated/prisma";
import type { SessionUser } from "../auth/session-user";

// Все права api описываются здесь. Условия пишутся синтаксисом Prisma where:
// той же записью CASL проверяет объект в памяти, а accessibleBy превращает её в
// фильтр выборки. Поэтому ручного `if (role === "STUDENT")` в сервисах нет, и
// роль, для которой правило не написано (как PARENT в аудите 2.4), ничего не
// получает.
//
// Клиент Prisma лежит не в @prisma/client, а в api/generated/prisma, поэтому
// CASL подключается через @casl/prisma/runtime с типами этого клиента.
// Модели добавляются в AppSubjects по мере переноса модулей.

export type Action = "manage" | "create" | "read" | "update" | "delete";

export type AppSubjects =
  | "all"
  // Виртуальные субъекты: отчёт и справочник — не таблицы, но права на них
  // описываются так же, как на модели, и проверка маршрута остаётся однородной.
  // UserDirectory — доступ к списку людей вообще, отдельно от права видеть
  // конкретного человека (свой профиль есть у всех).
  | "HomeworkStatistics"
  | "UserDirectory"
  // Деньги: начисления, долги, оплаты — только администратор
  | "Billing"
  | Subjects<{
      User: User;
      AuditLog: AuditLog;
    }>;

export type PrismaQuery<T extends PrismaModel = PrismaModel> = PrismaQueryOf<Prisma.TypeMap, T>;

export type AppAbility = Ability<[Action, AppSubjects], PrismaQuery>;

export { accessibleBy };

export function defineAbilityFor(user: Pick<SessionUser, "id" | "role">): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

  switch (user.role) {
    case "ADMIN":
      can("manage", "all");
      break;

    case "TEACHER":
      // Ученики целиком (преподаватели подменяют друг друга — решение владельца
      // от 2026-09-16) и свой профиль
      can("read", "User", { role: "STUDENT" });
      can("read", "User", { id: user.id });
      can("read", "UserDirectory");
      can("read", "HomeworkStatistics");
      break;

    case "STUDENT":
    case "PARENT":
      // Только свой профиль. Остальные права появляются вместе с модулями.
      can("read", "User", { id: user.id });
      break;
  }

  return build();
}

@Injectable()
export class AbilityFactory {
  createForUser(user: Pick<SessionUser, "id" | "role">): AppAbility {
    return defineAbilityFor(user);
  }
}

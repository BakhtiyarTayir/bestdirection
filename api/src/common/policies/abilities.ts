import { Ability, AbilityBuilder } from "@casl/ability";
import {
  accessibleBy,
  createPrismaAbility,
  type PrismaModel,
  type PrismaQueryOf,
  type Subjects,
} from "@casl/prisma/runtime";
import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "../../../generated/prisma";
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
  | Subjects<{
      User: User;
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
    case "STUDENT":
    case "PARENT":
      // Свой профиль. Остальные права появляются вместе с модулями.
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

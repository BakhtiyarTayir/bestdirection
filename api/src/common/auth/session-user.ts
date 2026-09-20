import type { Role } from "../../../generated/prisma";

/**
 * Пользователь запроса. Роль и активность — из БД, а не из токена.
 *
 * Почты в системе больше нет (шаг 2 отказа от почты,
 * PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1) — login остался
 * необязательным на уровне типа только потому, что часть выборок (например,
 * SessionUserCache) не всегда его запрашивает; в базе колонка NOT NULL.
 */
export interface SessionUser {
  id: string;
  role: Role;
  login: string | null;
  firstName: string;
  lastName: string;
}

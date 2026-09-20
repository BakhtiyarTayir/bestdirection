import type { Role } from "../../../generated/prisma";

/**
 * Пользователь запроса. Роль и активность — из БД, а не из токена.
 *
 * И login, и email присутствуют одновременно: логин заменяет почту как
 * опознавательный знак (PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1), но
 * почта остаётся в шаге 1 — часть web ещё её показывает.
 */
export interface SessionUser {
  id: string;
  role: Role;
  login: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
}

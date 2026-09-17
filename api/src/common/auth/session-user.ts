import type { Role } from "../../../generated/prisma";

/** Пользователь запроса. Роль и активность — из БД, а не из токена. */
export interface SessionUser {
  id: string;
  role: Role;
  email: string | null;
  firstName: string;
  lastName: string;
}

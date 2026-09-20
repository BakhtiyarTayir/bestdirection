import type { PrismaClient } from "../../../generated/prisma";
import { slugify } from "../slugify";

/**
 * Формат логина (PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1): латиница,
 * цифры, точка, дефис, подчёркивание; 3–30 символов. Общий для DTO (проверка
 * ввода) и генератора (проверка результата) — один источник правды.
 */
export const LOGIN_REGEX = /^[a-z0-9][a-z0-9._-]{2,29}$/;

const MIN_LOGIN_LENGTH = 3;
const MAX_LOGIN_LENGTH = 30;

function clamp(value: string): string {
  // Логин обязан начинаться с буквы или цифры — точка/дефис в начале не разрешены
  let candidate = value.replace(/^[^a-z0-9]+/, "");
  if (candidate.length < MIN_LOGIN_LENGTH) candidate = `${candidate}usr`;
  return candidate.slice(0, MAX_LOGIN_LENGTH);
}

/**
 * Кандидат логина из локальной части почты: у людей, которые уже привыкли
 * логиниться почтой, логин получается узнаваемым (ivan.ivanov@gmail.com →
 * ivan.ivanov). null — если после очистки почти ничего не осталось.
 */
export function loginBaseFromEmail(email: string): string | null {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const sanitized = local.replace(/[^a-z0-9._-]/g, "");
  return sanitized.length >= MIN_LOGIN_LENGTH ? clamp(sanitized) : null;
}

/** Кандидат логина из имени и фамилии — транслитерация через тот же slugify, что и у слагов курсов. */
export function loginBaseFromName(firstName: string, lastName: string): string {
  const base = [slugify(firstName), slugify(lastName)]
    .filter((part) => part && part !== "untitled")
    .join(".")
    .replace(/-/g, ".");
  return clamp(base || "user");
}

/**
 * Свободный логин на основе базового варианта: свободен — берём как есть,
 * занят — добавляем числовой суффикс (ivan.ivanov, затем ivan.ivanov2,
 * ivan.ivanov3, …). Проверка идёт через prismaUnscoped: логин мягко
 * удалённого пользователя остаётся занятым — та же причина, по которой так
 * устроен UsersService.emailTakenBy.
 */
export async function generateUniqueLogin(
  prismaUnscoped: Pick<PrismaClient, "user">,
  base: string
): Promise<string> {
  const taken = async (login: string) =>
    (await prismaUnscoped.user.findUnique({ where: { login }, select: { id: true } })) !== null;

  if (!(await taken(base))) return base;

  let suffix = 2;
  let candidate = `${base}${suffix}`.slice(0, MAX_LOGIN_LENGTH);
  while (await taken(candidate)) {
    suffix++;
    candidate = `${base}${suffix}`.slice(0, MAX_LOGIN_LENGTH);
  }
  return candidate;
}

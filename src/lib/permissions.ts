import type { Role } from "@/validators/user";

/**
 * Права ролей в вебе: зеркало goapi/internal/policy (источник правды - api, web только прячет
 * то, что api всё равно закроет 403). Страницы и компоненты спрашивают право, а не роль:
 * тогда перейти к настраиваемым ролям можно, поменяв только эту таблицу.
 *
 * - operate: работа с любыми курсами, группами, людьми, лидами, СМС и сайтом центра
 *   (раньше "роль == ADMIN"); у преподавателя - только своё, он сюда не входит;
 * - cashier: приём оплат, журнал оплат, должники, карточка оплат ученика;
 * - deletePayment, refund: удаление оплат и возвраты ученикам (касса администратора);
 * - finance: страница «Финансы» и денежные блоки главной;
 * - payroll: зарплата педагогов, ставки и тип оплаты, режим «по журналу» в группе;
 * - salary: видеть ставку преподавателя в группе (администратор и сам преподаватель, менеджер - нет);
 * - settings: настройки центра, поля ученика, интеграции, филиалы (создание и правка);
 * - subscription: подписка центра; audit: журнал аудита;
 * - manageStaff: заводить, повышать и править администраторов и менеджеров.
 */
export type Permission =
  | "operate"
  | "cashier"
  | "finance"
  | "deletePayment"
  | "refund"
  | "payroll"
  | "salary"
  | "settings"
  | "subscription"
  | "audit"
  | "manageStaff";

const GRANTS: Record<Role, readonly Permission[]> = {
  ADMIN: ["operate", "cashier", "finance", "deletePayment", "refund", "payroll", "salary", "settings", "subscription", "audit", "manageStaff"],
  // Менеджер: всё, кроме финансов и настроек (решение владельца 2026-11-13)
  MANAGER: ["operate", "cashier"],
  TEACHER: ["salary"],
  STUDENT: [],
  PARENT: [],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  return !!role && (GRANTS[role as Role]?.includes(permission) ?? false);
}

/** Роли с правом - для requireRole и списков ролей пунктов меню. */
export function rolesWith(permission: Permission, ...also: Role[]): Role[] {
  const roles = (Object.keys(GRANTS) as Role[]).filter((role) => GRANTS[role].includes(permission));
  return [...roles, ...also.filter((role) => !roles.includes(role))];
}

/** Роли, которые вправе назначать пользователям: менеджеру администраторы и менеджеры закрыты. */
export function assignableRoles(role: string | null | undefined): Role[] {
  const all: Role[] = ["ADMIN", "MANAGER", "TEACHER", "STUDENT", "PARENT"];
  return can(role, "manageStaff") ? all : all.filter((r) => r !== "ADMIN" && r !== "MANAGER");
}

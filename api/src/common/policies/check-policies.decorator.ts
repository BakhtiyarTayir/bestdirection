import { SetMetadata } from "@nestjs/common";
import type { AppAbility } from "./abilities";

export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = "access:policies";

/**
 * Что пользователь должен уметь, чтобы вызвать маршрут. Проверка на уровне
 * типа объекта («может читать группы»). Доступ к конкретной записи решает
 * сервис через accessibleBy — чужой id отдаёт 404, а не 403.
 */
export const CheckPolicies = (...handlers: PolicyHandler[]) => SetMetadata(CHECK_POLICIES_KEY, handlers);

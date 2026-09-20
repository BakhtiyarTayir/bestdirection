import "server-only";
import type { ApiBranch } from "./branches";
import { apiServerFetch } from "./server";

// Тот же маршрут справочника филиалов для серверных компонентов, см. users.server.

export const getBranches = () => apiServerFetch<ApiBranch[]>("/branches");

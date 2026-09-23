"use client";

import { useEffect } from "react";
import { markUsersSeen } from "@/lib/api/users";
import { refreshBadges } from "@/lib/badge-refresh";

/**
 * Администратор открыл список пользователей — цифра новых в меню
 * обнуляется. Отдельный клиентский компонент: страница серверная, а отметка
 * должна случиться при открытии, не при каждом серверном рендере.
 */
export function MarkUsersSeen() {
  useEffect(() => {
    void markUsersSeen().then(() => refreshBadges());
  }, []);
  return null;
}

"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface TelegramWriteButtonProps {
  /** Имя пользователя Telegram необязательно (аудит 4.2) — без него прямой
   *  ссылки не существует, и кнопка не рендерится вовсе, а не показывается
   *  неработающей. */
  username: string | null | undefined;
  size?: "default" | "sm";
  variant?: "default" | "outline" | "ghost";
}

/** Кнопка «Написать в Telegram» — на карточках ЧУЖИХ людей (4.2), не в своём профиле. */
export function TelegramWriteButton({ username, size = "sm", variant = "outline" }: TelegramWriteButtonProps) {
  const t = useTranslations("users");
  if (!username) return null;

  return (
    <Button asChild size={size} variant={variant}>
      <a href={`https://t.me/${username}`} target="_blank" rel="noopener noreferrer">
        <Send className="mr-1 h-4 w-4" />
        {t("writeInTelegram")}
      </a>
    </Button>
  );
}

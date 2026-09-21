"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTelegramLoginRequest,
  getTelegramBotUsername,
  getTelegramLoginStatus,
  loginWithTelegramCode,
  loginWithTelegramWidget,
} from "@/lib/api/auth";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

const POLL_INTERVAL_MS = 2500;

interface TelegramAuthProps {
  /**
   * Telegram — запасной способ входа под формой логина, а не главный:
   * кнопка меньше, разделитель «или» встаёт над ней.
   */
  compact?: boolean;
}

export function TelegramAuth({ compact = false }: TelegramAuthProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void getTelegramBotUsername().then((result) => {
      if (isMounted && result.success && result.data.username) {
        setBotUsername(result.data.username);
      }
    });
    return () => {
      isMounted = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const finishSignIn = useCallback(
    async (provider: string, params: Record<string, string>) => {
      const result =
        provider === "telegram-code"
          ? await loginWithTelegramCode(params.code)
          : await loginWithTelegramWidget(params);
      if (!result.success) {
        // Незнакомый Telegram больше не заводит учётную запись сам (шаг 1
        // отказа от почты) — отдельное сообщение вместо общего «не удалось»
        setError(result.error === "telegramUnknown" ? t("telegramUnknown") : t("telegramLoginFailed"));
        setWaiting(false);
        setLoginUrl(null);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    },
    [router, t]
  );

  // Вход через бота: одноразовый код подтверждается в чате,
  // страница опрашивает статус и завершает вход сама.
  const loginViaBot = async () => {
    setError(null);
    setWaiting(true);
    setLoginUrl(null);

    // Вкладку открываем синхронно, прямо в обработчике касания, и только потом
    // ждём код. WebKit (значит, все браузеры на iOS) разрешает window.open лишь
    // внутри жеста: вызов после await он блокирует молча, без ошибки — кнопка
    // уходила в ожидание, а Telegram не открывался.
    // Без "noopener": с ним window.open возвращает null и вкладку не направить.
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;

    const result = await createTelegramLoginRequest();
    if (!result.success || !result.data) {
      popup?.close();
      setError(t("telegramLoginFailed"));
      setWaiting(false);
      return;
    }

    const { code } = result.data;
    const url = `https://t.me/${botUsername}?start=login_${code}`;

    // Ссылка нужна в любом случае: попап может быть заблокирован и так —
    // переход по настоящему <a> браузеры не блокируют никогда.
    setLoginUrl(url);
    if (popup) popup.location.href = url;

    pollTimer.current = setInterval(async () => {
      const status = await getTelegramLoginStatus(code);
      if (!status.success || !status.data) return;

      if (status.data.status === "CONFIRMED") {
        if (pollTimer.current) clearInterval(pollTimer.current);
        void finishSignIn("telegram-code", { code });
      } else if (status.data.status === "EXPIRED") {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setError(t("telegramLoginExpired"));
        setWaiting(false);
        setLoginUrl(null);
      }
    }, POLL_INTERVAL_MS);
  };

  if (!botUsername) return null;

  // Разделитель идёт перед кнопкой, когда Telegram стоит запасным способом
  // под формой, и после неё, когда он главный, — иначе надпись «или» окажется
  // не между способами входа, а под последним из них.
  const divider = (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase text-muted-foreground">{t("orContinueWith")}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );

  return (
    <div className={compact ? "mt-6 space-y-3" : "mb-4 space-y-3"}>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {compact && divider}

      <Button
        type="button"
        size={compact ? "sm" : "default"}
        className="w-full bg-[#2AABEE] text-white hover:bg-[#229ED9]"
        onClick={loginViaBot}
        disabled={waiting}
      >
        <Send className="mr-2 h-4 w-4" />
        {waiting ? t("telegramWaitingConfirm") : t("loginWithTelegramBot")}
      </Button>

      {waiting && loginUrl && (
        <a
          href={loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-md border border-input px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {t("telegramOpenManually")}
        </a>
      )}

      {!compact && divider}
    </div>
  );
}

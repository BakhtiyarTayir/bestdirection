"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import {
  createTelegramLoginRequest,
  getTelegramBotUsername,
  getTelegramLoginStatus,
} from "@/actions/telegram-auth-actions";

const POLL_INTERVAL_MS = 2500;

interface TelegramWidgetUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

export function TelegramAuth() {
  const t = useTranslations("auth");
  const router = useRouter();
  const widgetRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void getTelegramBotUsername().then((result) => {
      if (isMounted && result.data.username) {
        setBotUsername(result.data.username);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const finishSignIn = useCallback(
    async (provider: string, params: Record<string, string>) => {
      const result = await signIn(provider, { ...params, redirect: false });
      if (result?.error) {
        setError(t("telegramLoginFailed"));
        setWaiting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    },
    [router, t]
  );

  // Официальный Telegram Login Widget
  useEffect(() => {
    if (!botUsername || !widgetRef.current) return;

    window.onTelegramAuth = (user) => {
      const params: Record<string, string> = {
        id: String(user.id),
        auth_date: String(user.auth_date),
        hash: user.hash,
      };
      if (user.first_name) params.first_name = user.first_name;
      if (user.last_name) params.last_name = user.last_name;
      if (user.username) params.username = user.username;
      if (user.photo_url) params.photo_url = user.photo_url;
      void finishSignIn("telegram-widget", params);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    const container = widgetRef.current;
    container.appendChild(script);

    return () => {
      container.replaceChildren();
      delete window.onTelegramAuth;
    };
  }, [botUsername, finishSignIn]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  // Запасной путь: подтверждение входа в чате с ботом
  const loginViaBot = async () => {
    setError(null);
    setWaiting(true);

    const result = await createTelegramLoginRequest();
    if (!result.success || !result.data) {
      setError(t("telegramLoginFailed"));
      setWaiting(false);
      return;
    }

    const { code } = result.data;
    window.open(
      `https://t.me/${botUsername}?start=login_${code}`,
      "_blank",
      "noopener"
    );

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
      }
    }, POLL_INTERVAL_MS);
  };

  if (!botUsername) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase text-muted-foreground">
          {t("orContinueWith")}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div ref={widgetRef} className="flex justify-center" />

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={loginViaBot}
        disabled={waiting}
      >
        <Send className="mr-2 h-4 w-4" />
        {waiting ? t("telegramWaitingConfirm") : t("loginWithTelegramBot")}
      </Button>
    </div>
  );
}

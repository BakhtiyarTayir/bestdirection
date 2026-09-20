"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  generateTelegramLinkCode,
  getTelegramStatus,
  unlinkTelegram,
} from "@/lib/api/users";
import { MessageCircle, Link2, Unlink, Loader2 } from "lucide-react";
import { getTelegramBotUsername } from "@/lib/api/auth";

export function TelegramLink() {
  const t = useTranslations("profile");
  const { toast } = useToast();
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getTelegramBotUsername().then((result) => {
      if (isMounted && result.success && result.data.username) {
        setBotUsername(result.data.username);
      }
    });

    void (async () => {
      const result = await getTelegramStatus();
      if (!isMounted) return;

      if (result.success && result.data) {
        setIsLinked(result.data.isLinked);
        setUsername(result.data.username);
      }
      setIsLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLink = async () => {
    setIsLinking(true);
    setLinkUrl(null);

    // Вкладку открываем синхронно, ещё внутри жеста: WebKit блокирует
    // window.open, вызванный после await, — на iOS Telegram не открывался.
    // Без "noopener": с ним window.open возвращает null и вкладку не направить.
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;

    const result = await generateTelegramLinkCode();
    if (result.success && result.data) {
      const botUrl = `https://t.me/${botUsername}?start=${result.data.code}`;
      // Ссылка на случай заблокированного попапа: переход по <a> не блокируют.
      setLinkUrl(botUrl);
      if (popup) popup.location.href = botUrl;
      toast({
        title: t("telegramOpenTitle"),
        description: t("telegramOpenDescription"),
      });
      // Poll for status change
      const interval = setInterval(async () => {
        const status = await getTelegramStatus();
        if (status.success && status.data?.isLinked) {
          setIsLinked(true);
          setUsername(status.data.username);
          clearInterval(interval);
          setIsLinking(false);
          setLinkUrl(null);
          toast({ title: t("telegramLinkedToast") });
        }
      }, 3000);
      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(interval);
        setIsLinking(false);
        setLinkUrl(null);
      }, 120000);
    } else {
      popup?.close();
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    const result = await unlinkTelegram();
    if (result.success) {
      setIsLinked(false);
      setUsername(null);
      toast({ title: t("telegramUnlinkedToast") });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <CardTitle className="text-base">{t("telegramTitle")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLinked ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-700 border-green-300">
                {t("telegramLinked")}
              </Badge>
              {username && (
                <span className="text-sm text-muted-foreground">@{username}</span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleUnlink}>
              <Unlink className="h-4 w-4 mr-1" />
              {t("telegramUnlink")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("telegramHint")}</p>
                {/* После отказа от почты это единственный способ сбросить
                    пароль самому, без администратора (4.2) */}
                <p className="text-sm text-muted-foreground">{t("telegramResetHint")}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLink}
                disabled={isLinking || !botUsername}
              >
                {isLinking ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1" />
                )}
                {t("telegramLink")}
              </Button>
            </div>
            {isLinking && linkUrl && (
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border border-input px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {t("telegramOpenManually")}
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

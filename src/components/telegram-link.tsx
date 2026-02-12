"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  generateTelegramLinkCode,
  getTelegramStatus,
  unlinkTelegram,
} from "@/actions/telegram-actions";
import { MessageCircle, Link2, Unlink, Loader2 } from "lucide-react";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

export function TelegramLink() {
  const { toast } = useToast();
  const [isLinked, setIsLinked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setIsLoading(true);
    const result = await getTelegramStatus();
    if (result.success && result.data) {
      setIsLinked(result.data.isLinked);
      setUsername(result.data.username);
    }
    setIsLoading(false);
  };

  const handleLink = async () => {
    setIsLinking(true);
    const result = await generateTelegramLinkCode();
    if (result.success && result.data) {
      const botUrl = `https://t.me/${BOT_USERNAME}?start=${result.data.code}`;
      window.open(botUrl, "_blank");
      toast({
        title: "Откройте Telegram",
        description: "Нажмите Start в боте для завершения привязки.",
      });
      // Poll for status change
      const interval = setInterval(async () => {
        const status = await getTelegramStatus();
        if (status.success && status.data?.isLinked) {
          setIsLinked(true);
          setUsername(status.data.username);
          clearInterval(interval);
          setIsLinking(false);
          toast({ title: "Telegram привязан!" });
        }
      }, 3000);
      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(interval);
        setIsLinking(false);
      }, 120000);
    } else {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    const result = await unlinkTelegram();
    if (result.success) {
      setIsLinked(false);
      setUsername(null);
      toast({ title: "Telegram отвязан" });
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
          <CardTitle className="text-base">Telegram</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLinked ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-700 border-green-300">
                Привязан
              </Badge>
              {username && (
                <span className="text-sm text-muted-foreground">@{username}</span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleUnlink}>
              <Unlink className="h-4 w-4 mr-1" />
              Отвязать
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Привяжите Telegram для отправки заданий через бота
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLink}
              disabled={isLinking || !BOT_USERNAME}
            >
              {isLinking ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-1" />
              )}
              Привязать
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

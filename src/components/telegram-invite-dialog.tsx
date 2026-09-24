"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toCanvas } from "qrcode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { createTelegramInvite, sendTelegramInviteSms, type ApiTelegramInviteSms } from "@/lib/api/users";
import { Check, Copy, Loader2, MessageSquareText, Send } from "lucide-react";

interface TelegramInviteDialogProps {
  userId: string;
  /** Уже привязан ли Telegram — определяет статус-бейдж рядом с кнопкой. */
  hasTelegram: boolean;
  /** Телефон из карточки. Без него кнопка «Отправить по SMS» не показывается. */
  phone: string | null;
  size?: "default" | "sm";
  variant?: "default" | "outline" | "ghost";
}

/**
 * Приглашение в Telegram, которое выдаёт администратор (план
 * PLAN-TELEGRAM-INVITE-2026-09-24): ссылку на бота можно скопировать,
 * показать QR-кодом или отправить по SMS. Замыкает круг «родителя завели с
 * паролем, который никто не знает, а привязать Telegram можно только уже
 * войдя» — теперь код выдаёт администратор.
 */
export function TelegramInviteDialog({
  userId,
  hasTelegram,
  phone,
  size = "sm",
  variant = "outline",
}: TelegramInviteDialogProps) {
  const t = useTranslations("telegramInvite");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsResult, setSmsResult] = useState<ApiTelegramInviteSms | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Код минтим при каждом открытии: он одноразовый и заменяет прежний, поэтому
  // не держим его между открытиями диалога — старая ссылка всё равно погасла бы.
  // Сброс полей — в openDialog (обработчик клика), а не здесь: setState прямо
  // в теле эффекта запускает лишний цикл рендера.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void createTelegramInvite(userId).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setInvite({ url: res.data.url, expiresAt: res.data.expiresAt });
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  // QR рисуем на клиенте: ссылка содержит одноразовый код, отдавать его на
  // сторонний сервис генерации картинок незачем.
  useEffect(() => {
    if (!invite || !canvasRef.current) return;
    void toCanvas(canvasRef.current, invite.url, { width: 180, margin: 1 });
  }, [invite]);

  const handleCopy = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.url);
    setCopied(true);
    toast({ title: tCommon("linkCopied") });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendSms = async () => {
    setSendingSms(true);
    const res = await sendTelegramInviteSms(userId);
    if (res.success) {
      setInvite({ url: res.data.url, expiresAt: res.data.expiresAt });
      setSmsResult(res.data);
      if (res.data.sent) toast({ title: t("smsSent") });
    } else {
      toast({ variant: "destructive", title: tErrors(res.error) });
    }
    setSendingSms(false);
  };

  const formatExpiry = (iso: string) =>
    new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // Открытие — обычный обработчик клика, а не эффект: здесь можно сбрасывать
  // состояние синхронно, эффект выше только запускает загрузку.
  const openDialog = () => {
    setInvite(null);
    setLoadError(null);
    setSmsResult(null);
    setCopied(false);
    setLoading(true);
    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={hasTelegram ? "border-green-300 text-green-700" : "text-muted-foreground"}
        >
          {hasTelegram ? t("linked") : t("notLinked")}
        </Badge>
        <Button type="button" size={size} variant={variant} onClick={openDialog}>
          <Send className="mr-1 h-4 w-4" aria-hidden="true" />
          {t("button")}
        </Button>
      </div>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("instructions")}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        )}

        {loadError && !loading && (
          <p className="text-sm text-destructive">{tErrors(loadError)}</p>
        )}

        {invite && !loading && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <canvas ref={canvasRef} role="img" aria-label={t("qrAlt")} />
            </div>

            <div className="space-y-1.5">
              <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                {invite.url}
              </p>
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleCopy}>
                {copied ? (
                  <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                {copied ? tCommon("linkCopied") : tCommon("copy")}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">{t("expiresAt", { date: formatExpiry(invite.expiresAt) })}</p>

            <div className="space-y-1.5 border-t pt-3">
              {phone ? (
                <>
                  <p className="text-xs text-muted-foreground">{t("smsTo", { phone })}</p>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={handleSendSms}
                    disabled={sendingSms}
                  >
                    {sendingSms ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <MessageSquareText className="mr-1 h-4 w-4" aria-hidden="true" />
                    )}
                    {t("sendSms")}
                  </Button>
                  {smsResult && !smsResult.sent && (
                    <p className="text-sm text-destructive">
                      {t("smsFailed")}
                      {smsResult.reason ? `: ${t(`smsReason.${smsResult.reason}`)}` : ""}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{t("noPhoneHint")}</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

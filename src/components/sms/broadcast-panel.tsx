"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { previewBroadcast, sendBroadcast } from "@/lib/api/sms";
import { AlertTriangle, Loader2, Send, Eye } from "lucide-react";

interface Template {
  id: string;
  title: string;
  status: string;
}

interface Recipient {
  parentId: string;
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  children: string[];
  text: string;
  parts: number;
  unicode: boolean;
  unresolved: string[];
}

interface Plan {
  groupName: string;
  templateStatus: string;
  recipients: Recipient[];
  sendableCount: number;
  skipped: Recipient[];
  withoutPhoneCount: number;
  studentCount: number;
  totalParts: number;
  estimatedCost: number;
}

export function BroadcastPanel({
  groupId,
  templates,
}: {
  groupId: string;
  templates: Template[];
}) {
  const t = useTranslations("sms");
  const numberLocale = intlLocale(useLocale());
  const tErrors = useTranslations("errors");
  const { toast } = useToast();

  const [templateId, setTemplateId] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pending, startTransition] = useTransition();

  // Отправлять можно только по согласованным: несогласованный текст шлюз
  // отобьёт, а попытка уже стоит денег
  const approved = templates.filter((tpl) => tpl.status === "APPROVED");
  const selected = templates.find((tpl) => tpl.id === templateId);

  const handlePreview = () => {
    if (!templateId) return;
    startTransition(async () => {
      const res = await previewBroadcast({ groupId, templateId });
      if (res.success) {
        setPlan(res.data as Plan);
      } else {
        toast({ variant: "destructive", title: tErrors(res.error ?? "somethingWentWrong") });
      }
    });
  };

  const handleSend = () => {
    if (!plan || plan.sendableCount === 0) return;
    const ok = window.confirm(
      t("confirmSend", {
        count: plan.sendableCount,
        cost: plan.estimatedCost.toLocaleString(numberLocale),
      })
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await sendBroadcast({ groupId, templateId });
      if (res.success) {
        toast({ title: t("sent", { count: res.data.sent }) });
        setPlan(null);
        setTemplateId("");
      } else {
        toast({ variant: "destructive", title: tErrors(res.error ?? "somethingWentWrong") });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("broadcastToGroup")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("templateNotApproved")}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1 space-y-1.5">
              <label className="text-sm font-medium">{t("selectTemplate")}</label>
              <Select value={templateId} onValueChange={(v) => { setTemplateId(v); setPlan(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={handlePreview} disabled={pending || !templateId}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {t("preview")}
            </Button>
          </div>
        )}

        {plan && (
          <div className="space-y-4">
            {/* Сводка до отправки: кнопка стоит рядом с реальными деньгами */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label={t("recipients")} value={plan.recipients.length} />
              <Stat label={t("willSend")} value={plan.sendableCount} />
              <Stat label={t("parts")} value={plan.totalParts} />
              <Stat
                label={t("estimatedCost")}
                value={`${plan.estimatedCost.toLocaleString(numberLocale)} ${t("sum")}`}
                emphasis
              />
            </div>

            {plan.recipients.some((r) => r.unicode) && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t("cyrillicWarning")}
              </p>
            )}

            {plan.skipped.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="font-medium">
                  {t("skipped")}: {plan.skipped.length}
                </div>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {plan.skipped.map((r) => (
                    <li key={r.parentId}>
                      {r.name} —{" "}
                      {!r.normalizedPhone
                        ? t("withoutPhone")
                        : `{${r.unresolved.join("}, {")}}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Текст одинаков по структуре, поэтому показываем первый как образец */}
            {plan.recipients[0] && (
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("preview")} · {plan.recipients[0].name}
                </div>
                <p className="whitespace-pre-wrap text-sm">{plan.recipients[0].text}</p>
              </div>
            )}

            <Button type="button" onClick={handleSend} disabled={pending || plan.sendableCount === 0}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {t("send")}
            </Button>
          </div>
        )}

        {selected && selected.status !== "APPROVED" && (
          <Badge variant="destructive">{t(`status.${selected.status}`)}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={emphasis ? "text-lg font-bold tabular-nums" : "text-lg tabular-nums"}>
        {value}
      </div>
    </div>
  );
}

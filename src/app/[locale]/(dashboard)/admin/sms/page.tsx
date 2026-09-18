import { requireRole } from "@/lib/auth-guard";
import { getSmsAccount, getSmsLog, getSmsTemplates } from "@/lib/api/sms.server";
import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale } from "@/i18n/config";
import { formatDate, formatShortDateTime } from "@/lib/format-date";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TemplatesManager } from "@/components/sms/templates-manager";
import { AlertTriangle } from "lucide-react";
import { formatPhone } from "@/lib/sms/phone";

export const dynamic = "force-dynamic";

const PART_PRICE = 340;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DELIVERED: "default",
  SENT: "secondary",
  QUEUED: "outline",
  FAILED: "destructive",
};

export default async function SmsPage() {
  await requireRole(["ADMIN"]);

  const t = await getTranslations("sms");
  const numberLocale = intlLocale(await getLocale());
  const [accountResult, templatesResult, logResult] = await Promise.all([
    getSmsAccount(),
    getSmsTemplates(),
    getSmsLog(50),
  ]);

  const account = accountResult.success ? accountResult.data : null;
  const accountError = accountResult.success ? null : accountResult.error;
  const templates = templatesResult.success ? templatesResult.data : [];
  const log = logResult.success ? logResult.data : { messages: [], broadcasts: [], delivered: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>

      {/* ─── Аккаунт ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("account")}</CardTitle>
          {account && <CardDescription>{account.name}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          {!account && !accountError && (
            <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>
          )}
          {accountError && (
            <p className="text-sm text-destructive">{accountError}</p>
          )}
          {account && (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums">
                  {account.balance.toLocaleString(numberLocale)}
                </span>
                <span className="text-muted-foreground">{t("sum")}</span>
                <span className="text-sm text-muted-foreground">
                  {t("balanceHint", { count: Math.floor(account.balance / PART_PRICE) })}
                </span>
              </div>
              {account.isTestMode && (
                <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <b>{t("testMode")}.</b> {t("testModeHint")}
                  </span>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Шаблоны ─── */}
      <TemplatesManager
        templates={templates.map((tpl) => ({
          id: tpl.id,
          title: tpl.title,
          textRu: tpl.textRu,
          status: tpl.status,
          eskizId: tpl.eskizId,
        }))}
      />

      {/* ─── Рассылки ─── */}
      {log.broadcasts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("broadcasts")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sentAt")}</TableHead>
                  <TableHead>{t("broadcast")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.broadcasts.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(b.createdAt)}
                    </TableCell>
                    <TableCell>
                      {b.template?.title ?? "—"}
                      {b.group?.name && (
                        <span className="text-muted-foreground"> · {b.group.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── Журнал ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("log")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {log.messages.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("noLog")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{t("sentAt")}</TableHead>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead className="min-w-[240px]">{t("text")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("parts")}</TableHead>
                  <TableHead className="text-right">{t("price")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatShortDateTime(m.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatPhone(m.phone)}</TableCell>
                    <TableCell className="max-w-[380px]">
                      <span className="line-clamp-2 text-sm">{m.text}</span>
                      {m.error && (
                        <span className="text-xs text-destructive">{m.error}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[m.status] ?? "outline"}>
                        {t(`smsStatus.${m.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.parts ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.price ? m.price.toLocaleString(numberLocale) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

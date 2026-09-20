"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format-date";
import type { ApiSalaryGroup, ApiSalaryPayout } from "@/lib/api/salary";

interface MySalaryViewProps {
  month: string;
  groups: ApiSalaryGroup[];
  accruedTotal: number;
  paidTotal: number;
  debt: number;
  payouts: ApiSalaryPayout[];
}

function percentText(bp: number | null): string {
  if (bp === null) return "";
  return (bp / 100).toFixed(1).replace(/\.0$/, "");
}

/**
 * Своя зарплата преподавателя — то же, что видит администратор на карточке
 * преподавателя, но без прав что-либо менять: без выплат, без ручной
 * фиксации, без пересчёта. По умолчанию показывает и базу, и процент
 * (план зарплат, открытый вопрос 3) — если это окажется лишним, компонент
 * достаточно сузить, схему трогать не придётся.
 */
export function MySalaryView({ month, groups, accruedTotal, paidTotal, debt, payouts }: MySalaryViewProps) {
  const t = useTranslations("salaries");
  const tPayments = useTranslations("payments");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const money = new Intl.NumberFormat(intlLocale(locale));

  const setMonth = (value: string) => {
    startTransition(() => {
      router.replace(value ? `${pathname}?month=${value}` : pathname);
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label htmlFor="my-salary-month" className="text-xs text-muted-foreground">
          {t("filterMonth")}
        </Label>
        <Input
          id="my-salary-month"
          type="month"
          className="w-40"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("accruedToDate", { month })}</div>
          <div className="text-2xl font-bold">{money.format(accruedTotal)} UZS</div>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("paidToDate", { month })}</div>
          <div className="text-2xl font-bold">{money.format(paidTotal)} UZS</div>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("debtToDate", { month })}</div>
          <div className="text-2xl font-bold">{money.format(debt)} UZS</div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("byGroups")}</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
        ) : (
          groups.map((group) => (
            <div key={`${group.courseId}:${group.groupId ?? "none"}`} className="rounded-lg border">
              <div className="border-b bg-muted/30 px-4 py-2 font-medium">
                {group.courseTitle}
                {group.groupName ? ` — ${group.groupName}` : ` (${t("withoutGroup")})`}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colMonth")}</TableHead>
                      <TableHead className="text-right">{t("colStudents")}</TableHead>
                      <TableHead className="text-right">{t("colBase")}</TableHead>
                      <TableHead className="text-right">{t("colRate")}</TableHead>
                      <TableHead className="text-right">{t("colAccrued")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.months.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          {t("noMonths")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      group.months.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="whitespace-nowrap">
                            {row.month}
                            {row.locked && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {t("locked")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">{row.studentsCount}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">{money.format(row.base)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {row.percentUsed === null ? (
                              <span className="text-amber-600">{t("noRate")}</span>
                            ) : (
                              `${percentText(row.percentUsed)}%`
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-medium">
                            {money.format(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("payoutsJournal")}</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPayouts")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tPayments("colPaidAt")}</TableHead>
                  <TableHead>{tPayments("colForMonth")}</TableHead>
                  <TableHead className="text-right">{t("colAmount")}</TableHead>
                  <TableHead>{tPayments("colMethod")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(payout.paidAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{payout.forMonth ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{money.format(payout.amount)}</TableCell>
                    <TableCell>{tPayments(`method.${payout.method}`)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

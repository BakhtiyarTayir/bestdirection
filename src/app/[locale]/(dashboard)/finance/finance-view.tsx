"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { cn } from "@/lib/utils";
import type { ApiFinance } from "@/lib/api/finance";

interface FinanceViewProps {
  data: ApiFinance;
  branchId?: string;
  branches: { id: string; name: string }[];
}

const ALL = "all";

export function FinanceView({ data, branchId, branches }: FinanceViewProps) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const { page, totalPages, pageItems, setPage } = usePagination(data.teachers, `${data.month}|${branchId ?? ""}`);

  const money = new Intl.NumberFormat(intlLocale(locale));
  // Названия месяцев — из переводов, а не из Intl: в данных ICU браузера
  // нет узбекского отдельного названия месяца, и «Sentabr 2026» выходило
  // как «2026 M09»
  const formatMonth = (month: string) => {
    const [year, monthNumber] = month.split("-");
    return `${t(`monthNames.m${Number(monthNumber)}`)} ${year}`;
  };
  // Убыток — красным: иначе минус в длинной колонке цифр легко пропустить
  const profitClass = (value: number) => (value < 0 ? "text-destructive" : undefined);

  const setFilter = (key: string, value: string) => {
    const next = { month: data.month, branchId, [key]: value === ALL ? "" : value };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  const { current } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="finance-month" className="text-xs text-muted-foreground">
            {t("filterMonth")}
          </Label>
          <Input
            id="finance-month"
            type="month"
            className="w-40"
            value={data.month}
            onChange={(e) => setFilter("month", e.target.value)}
          />
        </div>
        {branches.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("filterBranch")}</Label>
            <Select value={branchId ?? ALL} onValueChange={(value) => setFilter("branchId", value)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("allBranches")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allBranches")}</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="font-medium">{t("cashTitle")}</div>
          <p className="text-sm text-muted-foreground">{t("cashHint")}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t("received")}</dt>
              <dd className="tabular-nums">{money.format(current.received)} UZS</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t("paidOut")}</dt>
              <dd className="tabular-nums">− {money.format(current.paidOut)} UZS</dd>
            </div>
          </dl>
          <div className="mt-3 border-t pt-3">
            <div className="text-sm text-muted-foreground">{t("profit")}</div>
            <div className={cn("text-2xl font-bold tabular-nums", profitClass(current.cashProfit))}>
              {money.format(current.cashProfit)} UZS
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="font-medium">{t("accrualTitle")}</div>
          <p className="text-sm text-muted-foreground">{t("accrualHint")}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t("charged")}</dt>
              <dd className="tabular-nums">{money.format(current.charged)} UZS</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t("salaryAccrued")}</dt>
              <dd className="tabular-nums">− {money.format(current.salaryAccrued)} UZS</dd>
            </div>
          </dl>
          <div className="mt-3 border-t pt-3">
            <div className="text-sm text-muted-foreground">{t("profit")}</div>
            <div className={cn("text-2xl font-bold tabular-nums", profitClass(current.accrualProfit))}>
              {money.format(current.accrualProfit)} UZS
            </div>
          </div>
        </div>
      </div>
      {branchId && <p className="text-xs text-muted-foreground">{t("branchNote")}</p>}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("teachersTitle", { month: formatMonth(data.month) })}</h2>
        {data.teachers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            {t("teachersEmpty")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colTeacher")}</TableHead>
                  <TableHead className="text-right">{t("colAccrued")}</TableHead>
                  <TableHead className="text-right">{t("colPaidOut")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((row) => (
                  <TableRow key={row.teacherId}>
                    <TableCell>
                      <Link href={`/salaries/${row.teacherId}`} className="font-medium hover:underline">
                        {row.teacherName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {money.format(row.accrued)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {money.format(row.paidOut)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4 pb-4">
              <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("historyTitle")}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colMonth")}</TableHead>
                <TableHead className="text-right">{t("received")}</TableHead>
                <TableHead className="text-right">{t("paidOut")}</TableHead>
                <TableHead className="text-right">{t("colCashProfit")}</TableHead>
                <TableHead className="text-right">{t("charged")}</TableHead>
                <TableHead className="text-right">{t("salaryAccrued")}</TableHead>
                <TableHead className="text-right">{t("colAccrualProfit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="whitespace-nowrap">{formatMonth(row.month)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{money.format(row.received)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{money.format(row.paidOut)}</TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right font-medium tabular-nums", profitClass(row.cashProfit))}>
                    {money.format(row.cashProfit)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{money.format(row.charged)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {money.format(row.salaryAccrued)}
                  </TableCell>
                  <TableCell
                    className={cn("whitespace-nowrap text-right font-medium tabular-nums", profitClass(row.accrualProfit))}
                  >
                    {money.format(row.accrualProfit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

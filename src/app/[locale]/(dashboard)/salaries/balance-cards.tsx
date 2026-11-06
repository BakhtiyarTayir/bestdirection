"use client";

import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { ApiSalaryAdjustment } from "@/lib/api/salary";
import { AccruedBreakdown } from "./adjustments-section";

/** Предыдущий месяц ключа YYYY-MM (чистая строковая арифметика, часовой пояс не нужен). */
function previousMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
}

interface BalanceCardsProps {
  month: string;
  /** Остаток прошлых месяцев; отрицательный — переплата (аванс) */
  carriedOver: number;
  /** Начислено за месяц: группы + премии − штрафы */
  accruedMonth: number;
  /** Выплачено в счёт месяца (payoutMonth = month) */
  paidMonth: number;
  /** Итоговый долг = остаток + начислено − выплачено */
  debt: number;
  adjustments: ApiSalaryAdjustment[];
}

/**
 * Четыре карточки раскладки долга: остаток прошлых месяцев → начислено за
 * месяц → выплачено за месяц → итог. Общие для страницы учителя у админа и
 * кабинета самого учителя; подписи берут месяц из выбора, а не «прошлый».
 */
export function BalanceCards({ month, carriedOver, accruedMonth, paidMonth, debt, adjustments }: BalanceCardsProps) {
  const t = useTranslations("salaries");
  const locale = useLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border px-4 py-3">
        <div className="text-sm text-muted-foreground">{t("carriedOverTo", { prev: previousMonth(month) })}</div>
        <div className={cn("text-2xl font-bold", carriedOver < 0 && "text-green-600")}>
          {money.format(carriedOver)} UZS
        </div>
        {carriedOver < 0 && <div className="mt-1 text-xs text-green-600">{t("carriedOverAdvance")}</div>}
      </div>
      <div className="rounded-lg border bg-muted/40 px-4 py-3">
        <div className="text-sm text-muted-foreground">{t("accruedForMonth", { month })}</div>
        <div className="text-2xl font-bold">{money.format(accruedMonth)} UZS</div>
        <AccruedBreakdown adjustments={adjustments} month={month} accruedMonth={accruedMonth} />
      </div>
      <div className="rounded-lg border px-4 py-3">
        <div className="text-sm text-muted-foreground">{t("paidForMonth", { month })}</div>
        <div className="text-2xl font-bold">{money.format(paidMonth)} UZS</div>
      </div>
      <div className="rounded-lg border px-4 py-3">
        <div className="text-sm text-muted-foreground">{t("debtTotal")}</div>
        <div className="text-2xl font-bold">{money.format(debt)} UZS</div>
      </div>
    </div>
  );
}

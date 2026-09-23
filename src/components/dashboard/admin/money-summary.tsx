import { getTranslations } from "next-intl/server";
import { Banknote, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { ApiAdminDashboardMoney } from "@/lib/api/dashboard";

interface MoneySummaryProps {
  money: ApiAdminDashboardMoney;
  month: string;
  locale: string;
}

/** 1.1 плана: четыре карточки денег за месяц — все цифры уже посчитаны api. */
export async function MoneySummary({ money, month, locale }: MoneySummaryProps) {
  const t = await getTranslations("dashboardAdmin");
  const format = new Intl.NumberFormat(intlLocale(locale));

  const changeUp = (money.receivedChangePercent ?? 0) >= 0;
  const changeHint =
    money.receivedChangePercent === null ? (
      <span className="text-muted-foreground">{t("moneyNoLastMonth")}</span>
    ) : (
      <span className={cn("inline-flex items-center gap-1", changeUp ? "text-green-600" : "text-destructive")}>
        {changeUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {changeUp ? "+" : ""}
        {Math.round(money.receivedChangePercent)}% {t("moneyVsLastMonth")}
      </span>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MoneyCard
        title={t("moneyReceived")}
        value={`${format.format(money.received)} UZS`}
        hint={changeHint}
        icon={Wallet}
        href={`/payments?month=${month}`}
      />
      <MoneyCard
        title={t("moneyDebtStudents")}
        value={`${format.format(money.debtTotal)} UZS`}
        hint={t("debtorsCount", { count: money.debtorsCount })}
        icon={Users}
        href="/payments/debtors"
      />
      <MoneyCard
        title={t("moneyTeacherDebt")}
        value={`${format.format(money.teacherDebt)} UZS`}
        icon={Banknote}
        href="/salaries"
      />
      <MoneyCard
        title={t("moneyCashProfit")}
        value={`${format.format(money.cashProfit)} UZS`}
        valueClassName={money.cashProfit < 0 ? "text-destructive" : undefined}
        icon={Wallet}
        href="/finance"
      />
    </div>
  );
}

function MoneyCard({
  title,
  value,
  valueClassName,
  hint,
  icon: Icon,
  href,
}: {
  title: string;
  value: string;
  valueClassName?: string;
  hint?: React.ReactNode;
  icon: React.ElementType;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={cn("text-xl font-bold tabular-nums", valueClassName)}>{value}</div>
          {hint && <div className="mt-1 text-xs">{hint}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}

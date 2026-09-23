import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { intlLocale } from "@/i18n/config";

interface SalaryCardProps {
  accruedThisMonth: number;
  paidTotal: number;
  debt: number;
  locale: string;
}

/**
 * Моя зарплата за месяц — ведёт на /salaries/me (план дашборда, раздел 2).
 * Главная цифра — начислено ИМЕННО за текущий месяц по всем моим группам;
 * выдано и долг — накопленным итогом, как их и показывает /salaries/me
 * (эти две величины по своей природе не привязаны к одному месяцу).
 */
export async function SalaryCard({ accruedThisMonth, paidTotal, debt, locale }: SalaryCardProps) {
  const t = await getTranslations("dashboardTeacher");
  const money = new Intl.NumberFormat(intlLocale(locale));

  return (
    <Link href="/salaries/me" className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("mySalary")}</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-bold">{money.format(accruedThisMonth)} UZS</div>
          <div className="text-xs text-muted-foreground">
            {t("paidToDate")}: {money.format(paidTotal)} UZS
          </div>
          <div className="text-xs text-muted-foreground">
            {t("debtToDate")}: {money.format(debt)} UZS
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

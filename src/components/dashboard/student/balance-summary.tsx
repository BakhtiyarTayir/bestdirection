import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { intlLocale } from "@/i18n/config";
import type { ApiStudentBilling } from "@/lib/api/dashboard.server";

/**
 * Баланс ученика: итог и по каждому курсу. Ровно то, что отдаёт
 * StudentDashboardService — урезанная витрина BillingService.studentBilling,
 * без истории платежей и имён сотрудников (раздел 3 плана дашборда).
 *
 * Знак важнее цвета (правило раздела 0), поэтому число всегда подписано
 * словом «долг»/«аванс», а не просто красным/зелёным.
 */
export async function BalanceSummary({
  billing,
  locale,
}: {
  billing: ApiStudentBilling;
  locale: string;
}) {
  const t = await getTranslations("dashboardStudent");
  const money = new Intl.NumberFormat(intlLocale(locale));

  const balanceText = (value: number) =>
    value === 0
      ? t("balanceZero")
      : value > 0
        ? t("balanceAdvance", { amount: money.format(value) })
        : t("balanceDebt", { amount: money.format(-value) });

  const balanceClass = (value: number) =>
    value === 0 ? "text-muted-foreground" : value > 0 ? "text-emerald-600" : "text-destructive";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          {t("balanceTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${balanceClass(billing.balance)}`}>
          {balanceText(billing.balance)}
        </div>
        {billing.prepaidFuture > 0 && (
          <div className="mt-1 text-sm text-emerald-600">
            {t("prepaidFuture", { amount: money.format(billing.prepaidFuture) })}
          </div>
        )}

        {billing.courses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("noCourses")}</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {billing.courses.map((course) => (
              <li
                key={course.courseId}
                className="flex items-center justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0"
              >
                <span>
                  {course.courseTitle}
                  {course.groupName && (
                    <span className="text-muted-foreground"> · {course.groupName}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {money.format(course.monthlyPrice)} {t("perMonth")}
                  </span>
                </span>
                <span className={`shrink-0 font-medium ${balanceClass(course.balance)}`}>
                  {balanceText(course.balance)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

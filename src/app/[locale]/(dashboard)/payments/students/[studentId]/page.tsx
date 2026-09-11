import { requireRole } from "@/lib/auth-guard";
import { getTranslations, getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { intlLocale } from "@/i18n/config";
import { getStudentBilling } from "@/actions/billing-actions";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BillingSettingsButton } from "./billing-settings-button";

export const dynamic = "force-dynamic";

interface StudentBillingPageProps {
  params: Promise<{ studentId: string }>;
}

// Формы данных описаны здесь, как в других разделах: серверные действия
// возвращают широкий тип, и без этого поля приходили бы как any.
interface MonthRow {
  month: string;
  charged: number;
  paid: number;
  basis: string;
  unitsTotal: number;
  unitsBilled: number;
  balance: number;
}

interface CourseBilling {
  enrollmentId: string;
  course: { id: string; title: string };
  group: { id: string; name: string } | null;
  monthlyPrice: number;
  hasSchedule: boolean;
  startsAt: string;
  billingEndsAt: string | null;
  totalCharged: number;
  totalPaid: number;
  balance: number;
  months: MonthRow[];
}

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  forMonth: string | null;
  comment: string | null;
  courseTitle: string;
  groupName: string | null;
  createdBy: string;
}

export default async function StudentBillingPage({ params }: StudentBillingPageProps) {
  await requireRole(["ADMIN"]);
  const { studentId } = await params;
  const t = await getTranslations("studentBilling");
  const tDebtors = await getTranslations("debtors");
  const tPayments = await getTranslations("payments");
  const locale = await getLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));

  const result = await getStudentBilling(studentId);
  if (!result.success || !result.data) notFound();
  const { student, totals } = result.data;
  const courses = result.data.courses as CourseBilling[];
  const payments = result.data.payments as PaymentRow[];

  /** Плюс — аванс, минус — долг. Знак важнее цвета, поэтому пишем оба. */
  const balanceText = (value: number) =>
    value === 0
      ? t("settled")
      : value > 0
        ? t("advance", { amount: money.format(value) })
        : t("debt", { amount: money.format(-value) });

  const balanceClass = (value: number) =>
    value === 0
      ? "text-muted-foreground"
      : value > 0
        ? "text-emerald-600"
        : "text-destructive";

  const basisLabel = (row: MonthRow) => {
    switch (row.basis) {
      case "full":
        return tDebtors("basisFull");
      case "lessons":
        return tDebtors("basisLessons", {
          billed: row.unitsBilled,
          total: row.unitsTotal,
        });
      case "days":
        return tDebtors("basisDays", {
          billed: row.unitsBilled,
          total: row.unitsTotal,
        });
      case "manual":
        return tDebtors("basisManual");
      default:
        return "—";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {student.lastName} {student.firstName}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {student.phone ?? tDebtors("noPhone")}
          {student.telegramUsername && ` · @${student.telegramUsername}`}
          {student.email && ` · ${student.email}`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tDebtors("colCharged")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {money.format(totals.charged)} UZS
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tDebtors("colPaid")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {money.format(totals.paid)} UZS
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("balance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balanceClass(totals.balance)}`}>
              {balanceText(totals.balance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t("noPaidCourses")}
        </div>
      ) : (
        courses.map((course) => (
          <Card key={course.enrollmentId}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{course.course.title}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {course.group?.name ?? tDebtors("noGroup")} ·{" "}
                    {money.format(course.monthlyPrice)} {tDebtors("perMonth")} ·{" "}
                    {t("since", { date: formatDate(new Date(course.startsAt)) })}
                    {course.billingEndsAt &&
                      ` · ${t("until", {
                        date: formatDate(new Date(course.billingEndsAt)),
                      })}`}
                  </p>
                  {/* Без расписания неполный месяц считается по календарным дням */}
                  {!course.hasSchedule && (
                    <Badge variant="outline" className="mt-2">
                      {t("noScheduleBadge")}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={`font-semibold ${balanceClass(course.balance)}`}>
                    {balanceText(course.balance)}
                  </div>
                  {/* Правка начислений доступна независимо от того, есть ли долг */}
                  <BillingSettingsButton enrollmentId={course.enrollmentId} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("month")}</TableHead>
                      <TableHead>{t("basis")}</TableHead>
                      <TableHead className="text-right">
                        {tDebtors("colCharged")}
                      </TableHead>
                      <TableHead className="text-right">
                        {tDebtors("colPaid")}
                      </TableHead>
                      <TableHead className="text-right">{t("balanceAtEnd")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {course.months.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          {t("notStartedYet")}
                        </TableCell>
                      </TableRow>
                    )}
                    {course.months.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium tabular-nums">
                          {row.month}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {basisLabel(row)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money.format(row.charged)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.paid ? money.format(row.paid) : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${balanceClass(row.balance)}`}
                        >
                          {balanceText(row.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("paymentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              {t("noPayments")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tPayments("colPaidAt")}</TableHead>
                    <TableHead>{tPayments("colCourse")}</TableHead>
                    <TableHead>{tPayments("colForMonth")}</TableHead>
                    <TableHead>{tPayments("colMethod")}</TableHead>
                    <TableHead className="text-right">
                      {tPayments("colAmount")}
                    </TableHead>
                    <TableHead>{tPayments("colRecordedBy")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(new Date(payment.paidAt))}
                      </TableCell>
                      <TableCell>
                        <div>{payment.courseTitle}</div>
                        {payment.groupName && (
                          <div className="text-xs text-muted-foreground">
                            {payment.groupName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {payment.forMonth ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {tPayments(`method.${payment.method}` as "method.CASH")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money.format(payment.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.createdBy}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

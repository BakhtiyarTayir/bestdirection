"use client";

import { Fragment, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/format-date";
import { Trash2 } from "lucide-react";
import type { ApiSalaryAdjustment, ApiSalaryMonthStudent, ApiSalaryPayout } from "@/lib/api/salary";
import { deletePayout } from "@/lib/api/salary";
import { CreatePayoutDialog } from "./create-payout-dialog";
import { CreateAdjustmentDialog } from "./create-adjustment-dialog";
import { AccruedBreakdown, AdjustmentsSection } from "../adjustments-section";

interface TeacherSalaryViewProps {
  teacherId: string;
  month: string;
  students: ApiSalaryMonthStudent[];
  studentsIncomplete: boolean;
  adjustments: ApiSalaryAdjustment[];
  accruedFromGroups: number;
  accruedTotal: number;
  paidTotal: number;
  debt: number;
  payouts: ApiSalaryPayout[];
}

export function TeacherSalaryView({
  teacherId,
  month,
  students,
  studentsIncomplete,
  adjustments,
  accruedFromGroups,
  accruedTotal,
  paidTotal,
  debt,
  payouts,
}: TeacherSalaryViewProps) {
  const t = useTranslations("salaries");
  const tCommon = useTranslations("common");
  const tPayments = useTranslations("payments");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const money = new Intl.NumberFormat(intlLocale(locale));

  const setMonth = (value: string) => {
    startTransition(() => {
      router.replace(value ? `${pathname}?month=${value}` : pathname);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="salary-month" className="text-xs text-muted-foreground">
            {t("filterMonth")}
          </Label>
          <Input
            id="salary-month"
            type="month"
            className="w-40"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateAdjustmentDialog teacherId={teacherId} defaultMonth={month} />
          <CreatePayoutDialog teacherId={teacherId} defaultAmount={debt > 0 ? debt : undefined} defaultForMonth={month} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("accruedToDate", { month })}</div>
          <div className="text-2xl font-bold">{money.format(accruedTotal)} UZS</div>
          <AccruedBreakdown adjustments={adjustments} month={month} accruedFromGroups={accruedFromGroups} />
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

      <MonthStudentsTable month={month} students={students} incomplete={studentsIncomplete} money={money} />

      <AdjustmentsSection adjustments={adjustments} canDelete />

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
                  <TableHead>{t("payoutKind")}</TableHead>
                  <TableHead className="text-right">{t("colAmount")}</TableHead>
                  <TableHead>{tPayments("colMethod")}</TableHead>
                  <TableHead>{t("colComment")}</TableHead>
                  <TableHead>{t("recordedBy")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <Fragment key={payout.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap">{formatDate(payout.paidAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">{payout.forMonth ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={payout.kind === "ADVANCE" ? "secondary" : "outline"}>
                          {t(`payoutKind${payout.kind}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money.format(payout.amount)}</TableCell>
                      <TableCell>{tPayments(`method.${payout.method}`)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{payout.comment ?? "—"}</TableCell>
                      <TableCell>{payout.createdBy}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t("deletePayout")}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("deletePayout")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("deletePayoutConfirm")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  const result = await deletePayout(payout.id);
                                  if (result.success) {
                                    toast({ title: t("payoutDeleted") });
                                    router.refresh();
                                  } else {
                                    toast({ title: tErrors("error"), description: tErrors("unexpected"), variant: "destructive" });
                                  }
                                }}
                              >
                                {tCommon("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Один общий список учеников преподавателя за месяц: группа — просто
 * столбец. Справочно — зарплата от этих чисел не считается.
 */
function MonthStudentsTable({
  month,
  students,
  incomplete,
  money,
}: {
  month: string;
  students: ApiSalaryMonthStudent[];
  incomplete: boolean;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations("salaries");
  const locale = useLocale();
  const collator = new Intl.Collator(intlLocale(locale));
  const sorted = [...students].sort(
    (a, b) =>
      collator.compare(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`) ||
      collator.compare(a.groupLabel, b.groupLabel)
  );
  const totals = students.reduce(
    (sum, student) => ({ charged: sum.charged + student.charged, paid: sum.paid + student.paid }),
    { charged: 0, paid: 0 }
  );
  const percent = totals.charged > 0 ? Math.round((totals.paid / totals.charged) * 100) : null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("monthStudentsTitle", { month })}</h2>
      {incomplete && <p className="text-sm text-destructive">{t("monthStudentsIncomplete")}</p>}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("monthStudentsEmpty")}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("studentsColName")}</TableHead>
                  <TableHead>{t("studentsColGroup")}</TableHead>
                  <TableHead className="text-right">{t("studentsColCharged")}</TableHead>
                  <TableHead className="text-right">{t("studentsColPaid")}</TableHead>
                  <TableHead className="text-right">{t("studentsColRemaining")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((student) => (
                  <TableRow key={`${student.groupLabel}:${student.studentId}`}>
                    <TableCell className="min-w-[160px]">
                      <Link href={`/payments/students/${student.studentId}`} className="font-medium hover:underline">
                        {student.lastName} {student.firstName}
                      </Link>
                      {student.unenrolled && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {t("studentUnenrolled")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[160px] text-sm text-muted-foreground">{student.groupLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{money.format(student.charged)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{money.format(student.paid)}</TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right ${
                        student.remaining > 0 ? "text-red-600" : student.remaining < 0 ? "text-green-600" : ""
                      }`}
                    >
                      {student.remaining < 0
                        ? `${money.format(-student.remaining)} (${t("studentOverpaid")})`
                        : money.format(student.remaining)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm font-medium">
            {percent === null
              ? t("studentsPaidOf", { paid: money.format(totals.paid), charged: money.format(totals.charged) })
              : t("studentsPaidOfPercent", {
                  paid: money.format(totals.paid),
                  charged: money.format(totals.charged),
                  percent,
                })}
          </p>
        </>
      )}
    </div>
  );
}

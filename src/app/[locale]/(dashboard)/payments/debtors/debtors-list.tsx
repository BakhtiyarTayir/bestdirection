"use client";

import { Fragment, useState, useTransition } from "react";
import { intlLocale } from "@/i18n/config";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, SlidersHorizontal, TriangleAlert, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BillingDialog } from "./billing-dialog";
import { CreatePaymentDialog } from "../create-payment-dialog";
import type { PaymentStudentOption } from "../payments-list";

export interface DebtorBreakdown {
  month: string;
  amount: number;
  basis: string;
  unitsTotal: number;
  unitsBilled: number;
}

export interface DebtorRow {
  enrollmentId: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    telegramUsername: string | null;
  };
  course: { id: string; title: string };
  group: { id: string; name: string } | null;
  monthlyPrice: number;
  hasSchedule: boolean;
  charged: number;
  paid: number;
  debt: number;
  billedMonths: number;
  breakdown: DebtorBreakdown[];
}

interface DebtorsListProps {
  month: string;
  debtors: DebtorRow[];
  students: PaymentStudentOption[];
  totalDebt: number;
  prepaidCount: number;
  prepaidTotal: number;
  withoutGroup: number;
  groupWithoutSchedule: number;
  courseId?: string;
  courses: { id: string; title: string }[];
  branchId?: string;
  branches: { id: string; name: string }[];
}

const ALL = "all";

export function DebtorsList({
  month,
  debtors,
  students,
  totalDebt,
  prepaidCount,
  prepaidTotal,
  withoutGroup,
  groupWithoutSchedule,
  courseId,
  courses,
  branchId,
  branches,
}: DebtorsListProps) {
  const t = useTranslations("debtors");
  const tPayments = useTranslations("payments");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [paying, setPaying] = useState<DebtorRow | null>(null);
  const [, startTransition] = useTransition();

  const money = new Intl.NumberFormat(intlLocale(locale));

  const setFilter = (key: string, value: string) => {
    const next = { month, courseId, branchId, [key]: value === ALL ? "" : value };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  const basisLabel = (item: DebtorBreakdown) => {
    switch (item.basis) {
      case "full":
        return t("basisFull");
      case "lessons":
        return t("basisLessons", { billed: item.unitsBilled, total: item.unitsTotal });
      case "days":
        return t("basisDays", { billed: item.unitsBilled, total: item.unitsTotal });
      case "manual":
        return t("basisManual");
      default:
        return "—";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="debtors-month" className="text-xs text-muted-foreground">
            {t("filterMonth")}
          </Label>
          <Input
            id="debtors-month"
            type="month"
            className="w-40"
            value={month}
            onChange={(e) => setFilter("month", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filterCourse")}</Label>
          <Select value={courseId ?? ALL} onValueChange={(value) => setFilter("courseId", value)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("allCourses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allCourses")}</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("totalDebt")}</div>
          <div className="text-2xl font-bold">{money.format(totalDebt)} UZS</div>
          <div className="text-sm text-muted-foreground">
            {t("debtorsCount", { count: debtors.length })}
          </div>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("prepaid")}</div>
          <div className="text-2xl font-bold">{money.format(prepaidTotal)} UZS</div>
          <div className="text-sm text-muted-foreground">
            {t("prepaidCount", { count: prepaidCount })}
          </div>
        </div>
        {/* Две причины расчёта по дням разведены: совет в каждом случае свой,
            а общий текст «задайте дни недели» сбивал с толку там, где дни у
            группы заданы, но студент в неё не добавлен. */}
        {(withoutGroup > 0 || groupWithoutSchedule > 0) && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              {t("byDaysTitle")}
            </div>
            {withoutGroup > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("withoutGroupHint", { count: withoutGroup })}
              </p>
            )}
            {groupWithoutSchedule > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("noScheduleHint", { count: groupWithoutSchedule })}
              </p>
            )}
          </div>
        )}
      </div>

      {debtors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t("colStudent")}</TableHead>
                <TableHead>{t("colCourse")}</TableHead>
                <TableHead className="text-right">{t("colCharged")}</TableHead>
                <TableHead className="text-right">{t("colPaid")}</TableHead>
                <TableHead className="text-right">{t("colDebt")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debtors.map((row) => {
                const isOpen = expanded === row.enrollmentId;
                return (
                  <Fragment key={row.enrollmentId}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={t("toggleBreakdown")}
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : row.enrollmentId)}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {/* Имя ведёт в карточку: там видна помесячная история
                            и, в отличие от этого списка, переплата */}
                        <Link
                          href={`/payments/students/${row.student.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.student.lastName} {row.student.firstName}
                        </Link>
                        <div className="text-sm text-muted-foreground">
                          {row.student.phone ?? t("noPhone")}
                          {row.student.telegramUsername && ` · @${row.student.telegramUsername}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{row.course.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {row.group?.name ?? t("noGroup")} · {money.format(row.monthlyPrice)}{" "}
                          {t("perMonth")}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {money.format(row.charged)}
                        <div className="text-xs text-muted-foreground">
                          {t("monthsBilled", { count: row.billedMonths })}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {money.format(row.paid)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Badge variant="destructive">{money.format(row.debt)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={tPayments("addPayment")}
                            title={tPayments("addPayment")}
                            onClick={() => setPaying(row)}
                          >
                            <Wallet className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("billingSettings")}
                            title={t("billingSettings")}
                            onClick={() => setEditing(row.enrollmentId)}
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={6}>
                          <div className="space-y-1 py-1">
                            <div className="text-sm font-medium">{t("breakdownTitle")}</div>
                            {row.breakdown.map((item) => (
                              <div
                                key={item.month}
                                className="flex flex-wrap justify-between gap-2 text-sm"
                              >
                                <span className="text-muted-foreground">
                                  {item.month} · {basisLabel(item)}
                                </span>
                                <span>{money.format(item.amount)} UZS</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <BillingDialog
          enrollmentId={editing}
          open
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {/* Тот же диалог, что на странице оплат, но открытый из строки: студент,
          курс и сумма долга уже подставлены, месяц — тот, что выбран в фильтре. */}
      <CreatePaymentDialog
        students={students}
        open={paying !== null}
        onOpenChange={(next) => !next && setPaying(null)}
        prefill={
          paying
            ? {
                studentId: paying.student.id,
                courseId: paying.course.id,
                amount: paying.debt,
                forMonth: month,
              }
            : null
        }
        onCreated={() => setPaying(null)}
      />
    </div>
  );
}

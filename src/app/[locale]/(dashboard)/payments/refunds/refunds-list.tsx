"use client";

import { useTransition } from "react";
import { intlLocale } from "@/i18n/config";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { SearchFilterInput } from "@/components/ui/search-filter-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format-date";
import { paymentMethods, type PaymentMethodValue } from "@/validators/payment";
import type { ApiRefundsPage } from "@/lib/api/billing";
import { DeleteRefundButton } from "../students/[studentId]/delete-refund-button";

interface RefundsListProps {
  refunds: ApiRefundsPage["refunds"];
  total: number;
  count: number;
  filters: {
    month?: string;
    q?: string;
    courseId?: string;
    method?: PaymentMethodValue;
    branchId?: string;
  };
  courses: { id: string; title: string }[];
  branches: { id: string; name: string }[];
}

/** Значение-заглушка для «все»: SelectItem не принимает пустую строку */
const ALL = "all";

export function RefundsList({ refunds, total, count, filters, courses, branches }: RefundsListProps) {
  const t = useTranslations("refunds");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const amountFormatter = new Intl.NumberFormat(intlLocale(locale));

  // Фильтры живут в URL: страница серверная, ссылка на отфильтрованный журнал шарится
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams();
    const next = { ...filters, [key]: value === ALL ? "" : value };
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <Label htmlFor="refunds-search" className="text-xs text-muted-foreground">{t("filterSearch")}</Label>
          <SearchFilterInput key={filters.q ?? ""} id="refunds-search" value={filters.q ?? ""} onSearch={(value) => setFilter("q", value)} placeholder={t("searchPlaceholder")} className="w-64" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="refunds-month" className="text-xs text-muted-foreground">{t("filterMonth")}</Label>
          <Input
            id="refunds-month"
            type="month"
            className="w-52"
            value={filters.month ?? ""}
            onChange={(e) => setFilter("month", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{t("filterCourse")}</Label>
          <Select value={filters.courseId ?? ALL} onValueChange={(value) => setFilter("courseId", value)}>
            <SelectTrigger className="w-52">
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

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{t("filterMethod")}</Label>
          <Select value={filters.method ?? ALL} onValueChange={(value) => setFilter("method", value)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t("allMethods")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allMethods")}</SelectItem>
              {paymentMethods.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`method.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {branches.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("filterBranch")}</Label>
            <Select value={filters.branchId ?? ALL} onValueChange={(value) => setFilter("branchId", value)}>
              <SelectTrigger className="w-52">
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

      <div className="rounded-lg border bg-muted/40 px-4 py-3">
        <div className="text-sm text-muted-foreground">{t("totalLabel")}</div>
        <div className="text-2xl font-bold tabular-nums">{amountFormatter.format(total)} UZS</div>
        <div className="text-sm text-muted-foreground">
          {t("refundsCount", { count })}
          {count > refunds.length && <span className="ml-2">{t("showingFirst", { shown: refunds.length, total: count })}</span>}
        </div>
      </div>

      {refunds.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colRefundedAt")}</TableHead>
                <TableHead>{t("colStudent")}</TableHead>
                <TableHead>{t("colCourse")}</TableHead>
                <TableHead>{t("colMethod")}</TableHead>
                <TableHead className="text-right">{t("colAmount")}</TableHead>
                <TableHead>{t("colRecordedBy")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(refund.refundedAt)}</TableCell>
                  <TableCell>
                    <Link href={`/payments/students/${refund.student.id}`} className="font-medium hover:underline">
                      {refund.student.lastName} {refund.student.firstName}
                    </Link>
                    {refund.student.phone && (
                      <div className="text-sm text-muted-foreground">{refund.student.phone}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{refund.course.title}</div>
                    {refund.group?.name && (
                      <div className="text-sm text-muted-foreground">{refund.group?.name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`method.${refund.method}`)}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">
                    {amountFormatter.format(refund.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {refund.createdBy.lastName} {refund.createdBy.firstName}
                    {refund.comment && <div className="text-xs italic">{refund.comment}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteRefundButton refundId={refund.id} amount={refund.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

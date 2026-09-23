"use client";

import { useTransition } from "react";
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
import { TriangleAlert } from "lucide-react";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import type { ApiSalaryOverviewRow } from "@/lib/api/salary";

interface SalariesListProps {
  month: string;
  rows: ApiSalaryOverviewRow[];
  totals: { base: number; accrued: number; paid: number; debt: number };
  branchId?: string;
  branches: { id: string; name: string }[];
}

const ALL = "all";

export function SalariesList({ month, rows, totals, branchId, branches }: SalariesListProps) {
  const t = useTranslations("salaries");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  // Месяц и филиал — в адресе: их смена открывает первую страницу
  const { page, totalPages, pageItems, setPage } = usePagination(rows, `${month}|${branchId ?? ""}`);

  const money = new Intl.NumberFormat(intlLocale(locale));

  const setFilter = (key: string, value: string) => {
    const next = { month, branchId, [key]: value === ALL ? "" : value };
    const params = new URLSearchParams();
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
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="salaries-month" className="text-xs text-muted-foreground">
            {t("filterMonth")}
          </Label>
          <Input
            id="salaries-month"
            type="month"
            className="w-40"
            value={month}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("totalAccrued")}</div>
          <div className="text-2xl font-bold">{money.format(totals.accrued)} UZS</div>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("totalPaid")}</div>
          <div className="text-2xl font-bold">{money.format(totals.paid)} UZS</div>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("totalDebt")}</div>
          <div className="text-2xl font-bold">{money.format(totals.debt)} UZS</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colTeacher")}</TableHead>
                <TableHead className="text-right">{t("colGroups")}</TableHead>
                <TableHead className="text-right">{t("colStudents")}</TableHead>
                <TableHead className="text-right">{t("colBase")}</TableHead>
                <TableHead className="text-right">{t("colAccrued")}</TableHead>
                <TableHead className="text-right">{t("colPaid")}</TableHead>
                <TableHead className="text-right">{t("colDebt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((row) => (
                <TableRow key={row.teacherId}>
                  <TableCell>
                    <Link href={`/salaries/${row.teacherId}`} className="font-medium hover:underline">
                      {row.teacherName}
                    </Link>
                    {row.unratedGroupsCount > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                        <TriangleAlert className="h-3 w-3" />
                        {t("unratedGroups", { count: row.unratedGroupsCount })}
                      </div>
                    )}
                    {row.fallbackGroupsCount > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                        <TriangleAlert className="h-3 w-3" />
                        {t("fallbackGroups", { count: row.fallbackGroupsCount })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">{row.groupsCount}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{row.studentsCount}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{money.format(row.base)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{money.format(row.accrued)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{money.format(row.paidTotal)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Badge variant={row.debt > 0 ? "destructive" : "secondary"}>
                      {money.format(row.debt)}
                    </Badge>
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
    </div>
  );
}

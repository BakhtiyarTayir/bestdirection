"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight, CalendarCheck } from "lucide-react";
import type { ApiAttendanceGroup } from "@/lib/api/attendance";

/** "2026-09-24" → "24.09" — короткая дата без года, как в журнале посещаемости */
function ddMm(dateKey: string): string {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

export function AttendanceGroupsList({
  groups,
  resetKey,
}: {
  groups: ApiAttendanceGroup[];
  /** Месяц+филиал+преподаватель одной строкой: их смена начинает список с первой страницы */
  resetKey: string;
}) {
  const t = useTranslations("attendance");
  // Тот же приём, что и в finance-view.tsx: смена фильтров — новая страница списка
  const { page, totalPages, pageItems, setPage } = usePagination(groups, resetKey);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <CalendarCheck className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">{t("noGroups")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">{t("groupCol")}</TableHead>
              <TableHead className="min-w-[160px]">{t("courseCol")}</TableHead>
              <TableHead className="min-w-[140px]">{t("branchCol")}</TableHead>
              <TableHead className="min-w-[160px]">{t("teacherRow")}</TableHead>
              <TableHead className="text-center whitespace-nowrap">{t("markedCol")}</TableHead>
              <TableHead className="whitespace-nowrap">{t("lastSession")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((group) => (
              <TableRow key={group.groupId}>
                <TableCell className="font-medium">{group.groupName}</TableCell>
                <TableCell>{group.courseTitle}</TableCell>
                <TableCell>{group.branchName}</TableCell>
                <TableCell>{group.teacherName ?? "—"}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {group.markedLessons < group.plannedLessons ? (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    >
                      {group.markedLessons}/{group.plannedLessons}
                    </Badge>
                  ) : (
                    <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                      {group.markedLessons}/{group.plannedLessons}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {group.lastSessionDate ? ddMm(group.lastSessionDate) : "—"}
                </TableCell>
                <TableCell>
                  <Link href={`/courses/${group.courseSlug}/groups/${group.groupId}/attendance`}>
                    <Button variant="outline" size="sm">
                      {t("openGroupJournal")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

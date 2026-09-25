"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TelegramWriteButton } from "@/components/telegram-write-button";
import { TrendingUp } from "lucide-react";

export interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
  login: string | null;
  phone: string | null;
  isActive: boolean;
  telegramUsername: string | null;
}

export function RosterTable({ students }: { students: RosterStudent[] }) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const { page, totalPages, offset, pageItems, setPage } = usePagination(students);

  if (students.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {t("noStudentsInGroup")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{tCommon("number")}</TableHead>
              <TableHead>{tCommon("firstName")}</TableHead>
              <TableHead>{t("rosterPhone")}</TableHead>
              <TableHead>{tCommon("login")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((student, index) => (
              <TableRow key={student.id}>
                <TableCell className="font-mono text-muted-foreground tabular-nums">{offset + index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">
                    {student.lastName} {student.firstName}
                  </div>
                  {!student.isActive && (
                    <Badge variant="outline" className="mt-1">
                      {tCommon("inactive")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{student.phone ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{student.login ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <TelegramWriteButton username={student.telegramUsername} />
                    <Link href={`/my-children/${student.id}/progress`}>
                      <Button variant="outline" size="sm" title={t("rosterProgress")}>
                        <TrendingUp className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">{t("rosterProgress")}</span>
                      </Button>
                    </Link>
                  </div>
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

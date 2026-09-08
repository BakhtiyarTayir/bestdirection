import { requireRole } from "@/lib/auth-guard";
import { getTeacherAttendanceReport } from "@/actions/attendance-actions";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

interface TeacherRow {
  teacherId: string;
  firstName: string;
  lastName: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
}

export default async function TeacherAttendancePage() {
  // Преподаватель тоже допущен: действие само сузит выборку до его занятий
  await requireRole(["ADMIN", "TEACHER"]);

  const t = await getTranslations("attendance");
  const result = await getTeacherAttendanceReport();
  const rows: TeacherRow[] = result.success ? (result.data as TeacherRow[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("teacherReport")}</h1>
        <p className="mt-1 text-muted-foreground">{t("teacherReportDescription")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("totalSessions")}</CardTitle>
          <CardDescription>
            {rows.reduce((sum, r) => sum + r.total, 0)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("noTeacherData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">{t("teacherRow")}</TableHead>
                    <TableHead className="text-right">{t("totalSessions")}</TableHead>
                    <TableHead className="text-right">{t("conducted")}</TableHead>
                    <TableHead className="text-right">{t("late")}</TableHead>
                    <TableHead className="text-right">{t("missed")}</TableHead>
                    <TableHead className="text-right">{t("unmarked")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.teacherId}>
                      <TableCell className="font-medium">
                        {row.lastName} {row.firstName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.present}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.late || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.absent > 0 ? (
                          <Badge variant="destructive">{row.absent}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {/* Неотмеченные — это занятия до появления отметки
                          преподавателя, а не пропуски: показываем отдельно */}
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.unmarked || "—"}
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

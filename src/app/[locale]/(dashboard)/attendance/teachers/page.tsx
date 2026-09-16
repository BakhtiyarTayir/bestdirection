import { requireRole } from "@/lib/auth-guard";
import {
  getTeacherAttendanceReport,
  getTeacherSessions,
} from "@/actions/attendance-actions";
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
import { PeriodFilter } from "./period-filter";
import { TeacherSessions, type TeacherSessionRow } from "./teacher-sessions";

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

interface TeacherAttendancePageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function TeacherAttendancePage({
  searchParams,
}: TeacherAttendancePageProps) {
  // Преподаватель тоже допущен: действие само сузит выборку до его занятий
  await requireRole(["ADMIN", "TEACHER"]);

  const t = await getTranslations("attendance");
  const { from, to } = await searchParams;
  const [result, sessionsResult] = await Promise.all([
    getTeacherAttendanceReport({ from, to }),
    getTeacherSessions({ from, to }),
  ]);
  const rows: TeacherRow[] = result.success ? (result.data as TeacherRow[]) : [];
  const sessions: TeacherSessionRow[] = sessionsResult.success
    ? (sessionsResult.data as TeacherSessionRow[])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("teacherReport")}</h1>
        <p className="mt-1 text-muted-foreground">{t("teacherReportDescription")}</p>
      </div>

      <PeriodFilter from={from} to={to} />

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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("sessionsTitle")}</CardTitle>
          <CardDescription>{t("sessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TeacherSessions rows={sessions} />
        </CardContent>
      </Card>
    </div>
  );
}

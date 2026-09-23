"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format-date";
import type { HomeworkSubmissionState } from "@/lib/api/users";

interface UsersHomeworkStatisticsProps {
  courses: { id: string; title: string; slug: string }[];
  homeworks: { id: string; title: string; passingScore: number; lesson: { title: string } }[];
  groups: { id: string; name: string }[];
  rows: {
    studentId: string;
    fullName: string;
    login: string | null;
    isActive: boolean;
    isOnlineNow: boolean;
    groupId: string | null;
    groupName: string | null;
    attempts: number;
    bestPercent: number;
    submissionState: "PASSED" | "FAILED" | "NOT_SUBMITTED";
    hasSubmission: boolean;
    // Строка: даты приходят из api в JSON; форматтер принимает и то и другое
    lastSubmittedAt: Date | string | null;
  }[];
  summary: {
    totalStudents: number;
    passedCount: number;
    failedCount: number;
    notSubmittedCount: number;
    averageBestPercent: number;
    onlineNowCount: number;
  };
  selectedCourseId?: string;
  selectedHomeworkId?: string;
  selectedGroupId?: string;
  selectedSubmissionState?: HomeworkSubmissionState;
}

function stateBadgeVariant(state: "PASSED" | "FAILED" | "NOT_SUBMITTED") {
  if (state === "PASSED") return "default" as const;
  if (state === "FAILED") return "destructive" as const;
  return "secondary" as const;
}

export function UsersHomeworkStatistics({
  courses,
  homeworks,
  groups,
  rows,
  summary,
  selectedCourseId,
  selectedHomeworkId,
  selectedGroupId,
  selectedSubmissionState = "ALL",
}: UsersHomeworkStatisticsProps) {
  const t = useTranslations("users");
  const searchParams = useSearchParams();
  const router = useRouter();
  // Курс, задание и группа — в адресе: их смена открывает первую страницу
  const { page, totalPages, pageItems, setPage } = usePagination(rows, searchParams.toString());

  const updateFilter = (key: string, value: string, reset?: string[]) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    if (reset) {
      for (const resetKey of reset) {
        params.delete(resetKey);
      }
    }

    router.push(`/statistics?${params.toString()}`);
  };

  const statusLabel = (state: "PASSED" | "FAILED" | "NOT_SUBMITTED") => {
    if (state === "PASSED") return t("statsStatusPassed");
    if (state === "FAILED") return t("statsStatusFailed");
    return t("statsStatusNotSubmitted");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Select
          value={selectedCourseId || "all"}
          onValueChange={(v) => updateFilter("courseId", v, ["homeworkId", "groupId"])}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("statsCourse")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("statsAllCourses")}</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedHomeworkId || "all"}
          onValueChange={(v) => updateFilter("homeworkId", v)}
          disabled={!selectedCourseId}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("statsHomework")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("statsAllHomeworks")}</SelectItem>
            {homeworks.map((homework) => (
              <SelectItem key={homework.id} value={homework.id}>
                {homework.lesson.title}: {homework.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedGroupId || "all"}
          onValueChange={(v) => updateFilter("groupId", v)}
          disabled={!selectedCourseId}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("statsGroup")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("statsAllGroups")}</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedSubmissionState}
          onValueChange={(v) => updateFilter("submissionState", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("statsSubmissionState")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("statsStatusAll")}</SelectItem>
            <SelectItem value="PASSED">{t("statsStatusPassed")}</SelectItem>
            <SelectItem value="FAILED">{t("statsStatusFailed")}</SelectItem>
            <SelectItem value="NOT_SUBMITTED">{t("statsStatusNotSubmitted")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("statsTotalStudents")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.totalStudents}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("statsPassed")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-green-600">{summary.passedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("statsFailed")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-destructive">{summary.failedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("statsNotSubmitted")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-muted-foreground">{summary.notSubmittedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("statsAveragePercent")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.averageBestPercent}%</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("statsOnlineNow")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-600">{summary.onlineNowCount}</CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("statsStudent")}</TableHead>
              <TableHead>{t("statsGroup")}</TableHead>
              <TableHead className="text-center">{t("statsAttempts")}</TableHead>
              <TableHead className="text-center">{t("statsBestPercent")}</TableHead>
              <TableHead className="text-center">{t("statsResult")}</TableHead>
              <TableHead>{t("statsLastSubmission")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!selectedCourseId || !selectedHomeworkId ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t("statsSelectCourseAndHomework")}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t("statsNoData")}
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell>
                    <div className="font-medium">{row.fullName}</div>
                    <div className="text-xs text-muted-foreground">{row.login}</div>
                    {row.isOnlineNow && (
                      <div className="text-xs text-emerald-600">{t("statsOnlineNow")}</div>
                    )}
                  </TableCell>
                  <TableCell>{row.groupName || t("statsUngrouped")}</TableCell>
                  <TableCell className="text-center">{row.attempts}</TableCell>
                  <TableCell className="text-center">
                    {row.hasSubmission ? `${row.bestPercent}%` : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={stateBadgeVariant(row.submissionState)}>
                      {statusLabel(row.submissionState)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.lastSubmittedAt ? formatDateTime(new Date(row.lastSubmittedAt)) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

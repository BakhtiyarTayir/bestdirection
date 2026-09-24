"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate, formatDayMonth } from "@/lib/format-date";
import { CalendarCheck, ClipboardList, FileText, GraduationCap } from "lucide-react";
import type { ApiProgress, ApiProgressCourse, ApiProgressHomeworkItem } from "@/lib/api/progress";

interface ProgressViewProps {
  data: ApiProgress;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Порог зависит от знака вопроса «хорошо/средне/плохо», а не от конкретной цифры — те же пороги, что у обзора группы (group-statistics.service.ts). */
function percentClass(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 80) return "text-emerald-600";
  if (value >= 50) return "text-amber-600";
  return "text-destructive";
}

export function ProgressView({ data }: ProgressViewProps) {
  const t = useTranslations("progress");
  const tFinance = useTranslations("finance");
  const tHub = useTranslations("homeworkHub");
  const tHomework = useTranslations("homework");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const percentText = (value: number | null) => (value === null ? t("noValue") : `${value}%`);

  // Названия месяцев — из переводов, не из Intl: та же причина, что в
  // finance-view.tsx (у ICU браузера нет узбекского названия месяца)
  const formatMonth = (month: string) => {
    const [year, monthNumber] = month.split("-");
    return `${tFinance(`monthNames.m${Number(monthNumber)}`)} ${year}`;
  };

  const setMonth = (value: string) => {
    const params = new URLSearchParams();
    if (value) params.set("month", value);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  const homeworkStatus = (item: ApiProgressHomeworkItem): { label: string; variant: BadgeVariant } => {
    if (!item.submitted) {
      return item.missed
        ? { label: tHub("tabs.overdue"), variant: "destructive" }
        : { label: tHub("tabs.todo"), variant: "outline" };
    }
    if (!item.reviewed) return { label: tHub("tabs.pending"), variant: "secondary" };
    if (item.manualStatus === "REVISION") return { label: tHub("tabs.revision"), variant: "secondary" };
    if (item.manualStatus === "REJECTED") return { label: tHomework("manualReviewRejected"), variant: "destructive" };
    return { label: tHub("tabs.completed"), variant: "default" };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            {data.student.lastName} {data.student.firstName}
          </h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="progress-month" className="text-xs text-muted-foreground">
            {t("selectMonth")}
          </Label>
          <Input
            id="progress-month"
            type="month"
            className="w-40"
            value={data.month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={CalendarCheck}
          title={t("tileAttendance")}
          value={percentText(data.totals.attendancePercent)}
          valueClass={percentClass(data.totals.attendancePercent)}
        />
        <Tile
          icon={ClipboardList}
          title={t("tileHomeworkDone")}
          value={`${data.totals.homeworkDone} / ${data.totals.homeworkTotal}`}
        />
        <Tile
          icon={FileText}
          title={t("tileHomeworkAvg")}
          value={percentText(data.totals.homeworkAvgPercent)}
          valueClass={percentClass(data.totals.homeworkAvgPercent)}
        />
        <Tile
          icon={GraduationCap}
          title={t("tileTestAvg")}
          value={percentText(data.totals.testAvgPercent)}
          valueClass={percentClass(data.totals.testAvgPercent)}
        />
      </div>

      {data.courses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t("coursesEmpty")}</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.courses.map((course) => (
            <CourseSection
              key={course.course.id}
              course={course}
              month={formatMonth(data.month)}
              t={t}
              percentText={percentText}
              homeworkStatus={homeworkStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  value,
  valueClass,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-2 pt-6">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
          <div className={cn("text-2xl font-bold tabular-nums", valueClass)}>{value}</div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

function CourseSection({
  course,
  month,
  t,
  percentText,
  homeworkStatus,
}: {
  course: ApiProgressCourse;
  month: string;
  t: ReturnType<typeof useTranslations<"progress">>;
  percentText: (value: number | null) => string;
  homeworkStatus: (item: ApiProgressHomeworkItem) => { label: string; variant: BadgeVariant };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{course.course.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Посещаемость — за выбранный месяц */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-medium">
              {t("sectionAttendance")} · {month}
            </h3>
            <span className={cn("font-semibold tabular-nums", percentClass(course.attendance.percent))}>
              {percentText(course.attendance.percent)}
            </span>
          </div>
          {course.attendance.total === 0 ? (
            <p className="text-sm text-muted-foreground">{t("attendanceEmpty")}</p>
          ) : (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                {t("attendanceCount", {
                  present: course.attendance.present + course.attendance.late,
                  total: course.attendance.total,
                })}
              </p>
              <p>
                {t("absencesLabel")}:{" "}
                {course.attendance.absentDates.length === 0
                  ? t("noAbsences")
                  : course.attendance.absentDates.map(formatDayMonth).join(", ")}
              </p>
            </div>
          )}
        </section>

        {/* Домашние задания — накопительно за весь курс */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-medium">{t("sectionHomework")}</h3>
            <span className="text-sm text-muted-foreground">
              {t("homeworkCount", { done: course.homework.done, total: course.homework.total })}
              {course.homework.avgPercent !== null && (
                <span className={cn("ml-2 font-semibold tabular-nums", percentClass(course.homework.avgPercent))}>
                  {percentText(course.homework.avgPercent)}
                </span>
              )}
            </span>
          </div>
          {course.homework.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("homeworkEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {course.homework.items.map((item) => {
                const status = homeworkStatus(item);
                return (
                  <li key={item.id} className="rounded-md border p-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{item.title}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {item.dueDate && <span>{t("dueDateLabel", { date: formatDate(item.dueDate) })}</span>}
                      {item.reviewed && item.percent !== null && (
                        <span className={cn("font-medium", percentClass(item.percent))}>
                          {t("gradeLabel", { percent: item.percent })}
                        </span>
                      )}
                    </div>
                    {item.teacherComment && (
                      <p className="mt-1 text-xs italic text-muted-foreground">«{item.teacherComment}»</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Тесты и экзамены — лучшая попытка по каждому */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-medium">{t("sectionTests")}</h3>
            {course.tests.avgPercent !== null && (
              <span className={cn("font-semibold tabular-nums", percentClass(course.tests.avgPercent))}>
                {percentText(course.tests.avgPercent)}
              </span>
            )}
          </div>
          {course.tests.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("testsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {course.tests.items.map((item) => (
                <li
                  key={item.assessmentId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-sm"
                >
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(item.completedAt)} · {t("attemptsCount", { count: item.attemptsCount })}
                    </div>
                  </div>
                  <span className={cn("font-semibold tabular-nums", percentClass(item.percent))}>{item.percent}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Прогресс по урокам */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">{t("sectionLessons")}</h3>
            <span className="text-sm text-muted-foreground">
              {t("lessonsCount", { completed: course.lessons.completed, total: course.lessons.total })}
            </span>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

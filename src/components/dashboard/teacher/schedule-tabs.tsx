"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, TriangleAlert, RotateCw, Calendar } from "lucide-react";
import type { ApiTeacherScheduleDay, ApiTeacherScheduleLesson } from "@/lib/api/dashboard.server";

interface ScheduleTabsProps {
  today: { date: string; markedCount: number; totalCount: number };
  schedule: {
    weekStart: string;
    weekEnd: string;
    month: string;
    days: ApiTeacherScheduleDay[];
  };
}

/** "2026-09-23" → "23.09" — короткая дата без года, как в журнале посещаемости */
function ddMm(dateKey: string): string {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

/**
 * Расписание моих групп: сегодня / неделя / месяц одним переключателем.
 * Данные приходят одним запросом (GET /dashboard/teacher) — вкладки только
 * фильтруют уже загруженный список дней, без отдельных обращений к api
 * (план дашборда, раздел 2.1).
 */
export function ScheduleTabs({ today, schedule }: ScheduleTabsProps) {
  const t = useTranslations("dashboardTeacher");

  const todayDay = schedule.days.find((day) => day.date === today.date);
  const weekDays = schedule.days.filter(
    (day) => day.date >= schedule.weekStart && day.date <= schedule.weekEnd && day.lessons.length > 0
  );
  const monthDays = schedule.days.filter(
    (day) => day.date.startsWith(`${schedule.month}-`) && day.lessons.length > 0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5" />
          {t("scheduleTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">{t("tabToday")}</TabsTrigger>
            <TabsTrigger value="week">{t("tabWeek")}</TabsTrigger>
            <TabsTrigger value="month">{t("tabMonth")}</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("markedOf", { marked: today.markedCount, total: today.totalCount })}
            </p>
            {!todayDay || todayDay.lessons.length === 0 ? (
              <EmptyDay text={t("noLessonsToday")} />
            ) : (
              <LessonList lessons={todayDay.lessons} t={t} />
            )}
          </TabsContent>

          <TabsContent value="week" className="space-y-4">
            {weekDays.length === 0 ? (
              <EmptyDay text={t("noLessonsWeek")} />
            ) : (
              weekDays.map((day) => <DayGroup key={day.date} day={day} t={t} />)
            )}
          </TabsContent>

          <TabsContent value="month" className="space-y-4">
            {monthDays.length === 0 ? (
              <EmptyDay text={t("noLessonsMonth")} />
            ) : (
              monthDays.map((day) => <DayGroup key={day.date} day={day} t={t} />)
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function EmptyDay({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function DayGroup({
  day,
  t,
}: {
  day: ApiTeacherScheduleDay;
  t: ReturnType<typeof useTranslations<"dashboardTeacher">>;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        {t(`weekdays.d${day.weekday}` as "weekdays.d1")}, {ddMm(day.date)}
      </div>
      <LessonList lessons={day.lessons} t={t} />
    </div>
  );
}

function LessonList({
  lessons,
  t,
}: {
  lessons: ApiTeacherScheduleLesson[];
  t: ReturnType<typeof useTranslations<"dashboardTeacher">>;
}) {
  return (
    <ul className="space-y-2">
      {lessons.map((lesson, index) => (
        <li
          key={`${lesson.groupId}-${index}`}
          className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="truncate font-medium">
              {lesson.courseTitle} — {lesson.groupName}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {[lesson.schedule, lesson.branchName].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge lesson={lesson} t={t} />
            <Link
              href={`/courses/${lesson.courseSlug}/groups/${lesson.groupId}/attendance`}
              className="text-sm text-primary underline underline-offset-2"
            >
              {t("openJournal")}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({
  lesson,
  t,
}: {
  lesson: ApiTeacherScheduleLesson;
  t: ReturnType<typeof useTranslations<"dashboardTeacher">>;
}) {
  if (lesson.isMakeup) {
    return (
      <Badge className="gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100">
        <RotateCw className="h-3 w-3" />
        {t("makeup")}
      </Badge>
    );
  }
  if (lesson.marked === true) {
    return (
      <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
        <Check className="h-3 w-3" />
        {t("marked")}
      </Badge>
    );
  }
  if (lesson.marked === false) {
    return (
      <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
        <TriangleAlert className="h-3 w-3" />
        {t("notMarked")}
      </Badge>
    );
  }
  // marked === null — занятие в будущем, отмечать ещё нечего: без пометки
  return null;
}

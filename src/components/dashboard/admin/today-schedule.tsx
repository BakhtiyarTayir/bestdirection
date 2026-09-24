import { getTranslations } from "next-intl/server";
import { Calendar, CheckCircle2, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { ApiAdminDashboardToday } from "@/lib/api/dashboard";

/** 1.2 плана: группы, у которых сегодня по расписанию занятие, и отмечен ли журнал. */
export async function TodaySchedule({ today }: { today: ApiAdminDashboardToday }) {
  const t = await getTranslations("dashboardAdmin");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Calendar className="h-4 w-4" />
          {t("todayTitle")}
        </CardTitle>
        {today.totalCount > 0 && (
          <span className="text-sm text-muted-foreground">
            {t("todayMarked", { marked: today.markedCount, total: today.totalCount })}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {today.lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("todayEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <ul className="divide-y">
              {today.lessons.map((lesson) => (
                <li key={lesson.groupId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/courses/${lesson.courseSlug}/groups/${lesson.groupId}/attendance`}
                      className="font-medium hover:underline"
                    >
                      {lesson.groupName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {lesson.courseTitle} · {lesson.branchName} · {lesson.teacherName}
                      {lesson.schedule ? ` · ${lesson.schedule}` : ""}
                    </p>
                  </div>
                  {lesson.marked ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      {t("marked")}
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-amber-600">
                      <TriangleAlert className="h-4 w-4" />
                      {t("notMarked")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

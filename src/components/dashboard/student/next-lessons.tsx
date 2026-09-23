import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import type { ApiNextLesson } from "@/lib/api/dashboard.server";

/**
 * Ближайшее занятие по каждой активной записи с группой — раздел 3 плана
 * дашборда. Дата уже посчитана сервисом по расписанию группы, здесь только
 * показ.
 */
export async function NextLessons({ lessons }: { lessons: ApiNextLesson[] }) {
  const t = await getTranslations("dashboardStudent");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          {t("nextLessonsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noNextLessons")}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {lessons.map((lesson) => (
              <li key={lesson.groupId}>
                <div className="font-medium">{lesson.courseTitle}</div>
                <div className="text-muted-foreground">
                  {lesson.groupName} · {formatDate(lesson.date)}
                  {lesson.schedule && ` · ${lesson.schedule}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

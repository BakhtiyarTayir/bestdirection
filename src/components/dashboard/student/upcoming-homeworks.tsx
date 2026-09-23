import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { FileText } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import type { ApiHomeworkDue } from "@/lib/api/dashboard.server";

/**
 * Задания со сроком, которые ученик ещё не сдавал — раздел 3 плана дашборда.
 * Список уже ограничен пятью ближайшими и отсортирован по сроку на сервере.
 */
export async function UpcomingHomeworks({ homeworks }: { homeworks: ApiHomeworkDue[] }) {
  const t = await getTranslations("dashboardStudent");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-4 w-4" aria-hidden="true" />
          {t("homeworksTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {homeworks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHomeworks")}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {homeworks.map((homework) => (
              <li key={homework.id}>
                <Link
                  href={`/courses/${homework.courseSlug}/lessons/${homework.lessonSlug}/homework/${homework.slug}`}
                  className="font-medium hover:underline"
                >
                  {homework.title}
                </Link>
                <div className="text-muted-foreground">
                  {homework.courseTitle} · {t("dueDate", { date: formatDate(homework.dueDate) })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

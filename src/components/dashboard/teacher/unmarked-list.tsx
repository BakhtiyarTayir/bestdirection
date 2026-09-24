import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriangleAlert } from "lucide-react";
import type { ApiTeacherUnmarkedGroup } from "@/lib/api/dashboard.server";

interface UnmarkedListProps {
  groups: ApiTeacherUnmarkedGroup[];
}

/**
 * Неотмеченные занятия за месяц по каждой моей группе — план дашборда,
 * раздел 2. Пустой список не показываем: нечего предъявлять, если журнал
 * ведётся полностью (план, раздел 0 — «нули не показывать»).
 */
export async function UnmarkedList({ groups }: UnmarkedListProps) {
  if (groups.length === 0) return null;
  const t = await getTranslations("dashboardTeacher");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-amber-700">
          <TriangleAlert className="h-5 w-5" />
          {t("unmarkedTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("unmarkedHint")}</p>
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.groupId} className="rounded-md border p-3">
              <Link
                href={`/courses/${group.courseSlug}/groups/${group.groupId}/attendance`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {group.courseTitle} — {group.groupName}
              </Link>
              <div className="mt-1 text-sm text-muted-foreground">{group.dates.join(", ")}</div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

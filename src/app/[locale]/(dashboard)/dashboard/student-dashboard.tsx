import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { BookOpen, FileText, TrendingUp } from "lucide-react";
import { getStudentDashboard } from "@/lib/api/dashboard.server";
import type { ApiDashboardSummary } from "@/lib/api/dashboard";
import { StudentBlocks } from "@/components/dashboard/student/student-blocks";

type StudentSummary = Extract<ApiDashboardSummary, { role: "STUDENT" }>;

/**
 * Главная кабинета ученика и родителя (раздел 3 плана дашборда,
 * PLAN-DASHBOARD-2026-09-23.md). Баланс, ближайшее занятие и задания со
 * сроком идут через свой эндпоинт /dashboard/student — роль внутри решает
 * сервис, здесь только раскладка. Нынешние счётчики «моих курсов»/«тестов»
 * берём из уже полученной на странице сводки: второй запрос ради них не нужен.
 */
export async function StudentDashboard({ summary }: { summary: StudentSummary }) {
  const t = await getTranslations("dashboardStudent");
  const tProgress = await getTranslations("progress");
  const locale = await getLocale();
  const result = await getStudentDashboard();

  // api недоступен — не роняем страницу, показываем хотя бы заголовок
  if (!result.success) {
    return <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>;
  }

  const data = result.data;

  if (data.role === "PARENT") {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">{t("parentTitle")}</h1>
        {data.children.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("noChildren")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {data.children.map((child) => (
              <div key={child.studentId}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold">
                    {child.lastName} {child.firstName}
                  </h2>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/my-children/${child.studentId}/progress`}>
                      <TrendingUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {tProgress("viewProgress")}
                    </Link>
                  </Button>
                </div>
                <StudentBlocks block={child} locale={locale} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <div className="space-y-6">
        <StudentBlocks block={data} locale={locale} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatCard title={t("myCourses")} value={summary.courses} icon={BookOpen} />
          <StatCard title={t("testsPassed")} value={summary.tests} icon={FileText} />
        </div>
      </div>
    </div>
  );
}

/** Та же карточка-счётчик, что на остальных ветках /dashboard, — своя копия: файл раздела 3 не зависит от правок соседних ролей в page.tsx. */
function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-2 pt-6">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

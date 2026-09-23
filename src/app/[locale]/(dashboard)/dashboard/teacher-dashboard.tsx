import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users } from "lucide-react";
import { getTeacherDashboard } from "@/lib/api/dashboard.server";
import { ScheduleTabs } from "@/components/dashboard/teacher/schedule-tabs";
import { SalaryCard } from "@/components/dashboard/teacher/salary-card";
import { UnmarkedList } from "@/components/dashboard/teacher/unmarked-list";

/**
 * Панель преподавателя (план дашборда, раздел 2): расписание моих групп
 * (сегодня/неделя/месяц), неотмеченные занятия за месяц, своя зарплата и
 * нынешние счётчики (курсы, ученики) вторым рядом. Числа считает api —
 * компонент только раскладывает их по карточкам.
 */
export async function TeacherDashboard() {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  const result = await getTeacherDashboard();
  if (!result.success || !result.data) {
    return <h1 className="text-3xl font-bold mb-6">{t("teacherTitle")}</h1>;
  }
  const data = result.data;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("teacherTitle")}</h1>

      <SalaryCard
        accruedThisMonth={data.salary.accruedThisMonth}
        paidTotal={data.salary.paidTotal}
        debt={data.salary.debt}
        locale={locale}
      />

      <ScheduleTabs today={data.today} schedule={data.schedule} />

      <UnmarkedList groups={data.unmarkedThisMonth} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TeacherStatCard title={t("myCourses")} value={data.courses} icon={BookOpen} href="/courses" />
        <TeacherStatCard title={t("enrolledStudents")} value={data.students} icon={Users} href="/statistics" />
      </div>
    </div>
  );
}

/**
 * Своя копия StatCard: страница page.tsx правится только в ветке TEACHER
 * (план дашборда, раздел 0), а её StatCard — приватная функция общего
 * файла. Проще завести маленький дубликат в своих файлах, чем тянуть общий
 * компонент из чужой страницы.
 */
function TeacherStatCard({
  title,
  value,
  icon: Icon,
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

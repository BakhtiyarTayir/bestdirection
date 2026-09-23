import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, ClipboardCheck, FileText, GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getDashboardSummary } from "@/lib/api/dashboard.server";
import { TeacherDashboard } from "./teacher-dashboard";

export const dynamic = "force-dynamic";

/**
 * Сводка на главной. Числа считает api и по роли вызывающего — интерфейс
 * только раскладывает их по карточкам.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("dashboard");
  const result = await getDashboardSummary();
  if (!result.success) return <DashboardError title={t("studentTitle")} />;

  const summary = result.data;

  if (summary.role === "ADMIN") {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">{t("adminTitle")}</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title={t("users")} value={summary.users} icon={Users} href="/users" />
          <StatCard title={t("courses")} value={summary.courses} icon={BookOpen} href="/courses" />
          <StatCard title={t("teachers")} value={summary.teachers} icon={GraduationCap} href="/teachers" />
          <StatCard title={t("students")} value={summary.students} icon={ClipboardCheck} href="/students" />
        </div>
      </div>
    );
  }

  if (summary.role === "TEACHER") {
    return <TeacherDashboard />;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("studentTitle")}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title={t("myCourses")} value={summary.courses} icon={BookOpen} />
        <StatCard title={t("testsPassed")} value={summary.tests} icon={FileText} />
      </div>
    </div>
  );
}

/** api недоступен — показываем заголовок без чисел, а не пустой экран. */
function DashboardError({ title }: { title: string }) {
  return <h1 className="text-3xl font-bold mb-6">{title}</h1>;
}

function StatCard({
  title,
  value,
  icon: Icon,
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  href?: string;
}) {
  const content = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}

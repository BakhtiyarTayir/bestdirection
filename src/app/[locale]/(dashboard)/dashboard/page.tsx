import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getDashboardSummary } from "@/lib/api/dashboard.server";
import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Сводка на главной. Числа считает api и по роли вызывающего — интерфейс
 * только раскладывает их по карточкам. searchParams — только ради branchId
 * администратора (план дашборда, 1.4); другие роли его не используют.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("dashboard");
  const result = await getDashboardSummary();
  if (!result.success) return <DashboardError title={t("studentTitle")} />;

  const summary = result.data;

  if (summary.role === "ADMIN") {
    const params = await searchParams;
    const branchId = typeof params.branchId === "string" && params.branchId ? params.branchId : undefined;
    return <AdminDashboard summary={summary} branchId={branchId} />;
  }

  if (summary.role === "TEACHER") {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">{t("teacherTitle")}</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatCard title={t("myCourses")} value={summary.courses} icon={BookOpen} href="/courses" />
          <StatCard
            title={t("enrolledStudents")}
            value={summary.students}
            icon={Users}
            href="/statistics"
          />
        </div>
      </div>
    );
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

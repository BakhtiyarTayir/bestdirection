import { getLocale, getTranslations } from "next-intl/server";
import { BookOpen, ClipboardCheck, GraduationCap, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { BranchFilter } from "@/components/branch-filter";
import { getAdminDashboard } from "@/lib/api/dashboard.server";
import { getBranches } from "@/lib/api/branches.server";
import { MoneySummary } from "@/components/dashboard/admin/money-summary";
import { TodaySchedule } from "@/components/dashboard/admin/today-schedule";
import { AttentionList } from "@/components/dashboard/admin/attention-list";
import { HostingNotice } from "@/components/dashboard/admin/hosting-notice";
import type { ApiDashboardSummary } from "@/lib/api/dashboard";

interface AdminDashboardProps {
  summary: Extract<ApiDashboardSummary, { role: "ADMIN" }>;
  branchId?: string;
}

/**
 * Главная панель администратора (план дашборда, раздел 1). Числа денег,
 * «сегодня» и «требует внимания» считает api (admin-dashboard.service.ts) —
 * страница только раскладывает их по карточкам.
 */
export async function AdminDashboard({ summary, branchId }: AdminDashboardProps) {
  const t = await getTranslations("dashboardAdmin");
  const locale = await getLocale();

  const [dashboardResult, branchesResult] = await Promise.all([
    getAdminDashboard(branchId),
    getBranches(),
  ]);

  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];
  const data = dashboardResult.success && dashboardResult.data ? dashboardResult.data : null;

  // Списки пользователей и учеников умеют фильтр по филиалу — ведём туда с ним
  const branchQuery = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <BranchFilter branchId={branchId} branches={branches} namespace="dashboardAdmin" />
      </div>

      {data ? (
        <>
          <HostingNotice hosting={data.hosting} />
          <MoneySummary money={data.money} month={data.month} locale={locale} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TodaySchedule today={data.today} />
            <AttentionList attention={data.attention} branchFiltered={Boolean(branchId)} />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t("loadError")}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">{t("referenceTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ReferenceCard title={t("users")} value={summary.users} icon={Users} href={`/users${branchQuery}`} />
          <ReferenceCard title={t("courses")} value={summary.courses} icon={BookOpen} href="/courses" />
          <ReferenceCard title={t("teachers")} value={summary.teachers} icon={GraduationCap} href="/teachers" />
          <ReferenceCard title={t("students")} value={summary.students} icon={ClipboardCheck} href={`/students${branchQuery}`} />
        </div>
      </div>
    </div>
  );
}

/** Тот же вид, что StatCard в page.tsx — своя копия: та используется и другими ролями. */
function ReferenceCard({
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
    <Link
      href={href}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
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

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDashboardSummary } from "@/lib/api/dashboard.server";
import { AdminDashboard } from "./admin-dashboard";
import { StudentDashboard } from "./student-dashboard";
import { TeacherDashboard } from "./teacher-dashboard";

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
  const params = await searchParams;
  const branchId = typeof params.branchId === "string" && params.branchId ? params.branchId : undefined;
  // Не-администраторам api фильтр филиала не применяет
  const result = await getDashboardSummary(session.user.role === "ADMIN" ? branchId : undefined);
  if (!result.success) return <DashboardError title={t("studentTitle")} />;

  const summary = result.data;

  if (summary.role === "ADMIN") {
    return <AdminDashboard summary={summary} branchId={branchId} />;
  }

  if (summary.role === "TEACHER") {
    return <TeacherDashboard />;
  }

  // Ученик и родитель: баланс, ближайшее занятие и задания со сроком — своя
  // ветка дашборда (раздел 3 плана главной панели), эту роль тут не трогаем
  return <StudentDashboard summary={summary} />;
}

/** api недоступен — показываем заголовок без чисел, а не пустой экран. */
function DashboardError({ title }: { title: string }) {
  return <h1 className="text-3xl font-bold mb-6">{title}</h1>;
}


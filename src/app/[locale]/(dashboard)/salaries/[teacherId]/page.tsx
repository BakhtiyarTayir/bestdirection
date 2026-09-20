import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getTeacherSalary } from "@/lib/api/salary.server";
import { TeacherSalaryView } from "./teacher-salary-view";

export const dynamic = "force-dynamic";

interface TeacherSalaryPageProps {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeacherSalaryPage({ params, searchParams }: TeacherSalaryPageProps) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("salaries");

  const { teacherId } = await params;
  const query = await searchParams;
  const month = typeof query.month === "string" && query.month ? query.month : undefined;

  const result = await getTeacherSalary(teacherId, { month });
  if (!result.success || !result.data) notFound();
  const { teacher, groups, accruedTotal, paidTotal, debt, payouts } = result.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {teacher.lastName} {teacher.firstName}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("subtitleTeacher")}</p>
      </div>
      <TeacherSalaryView
        teacherId={teacherId}
        month={result.data.month}
        groups={groups}
        accruedTotal={accruedTotal}
        paidTotal={paidTotal}
        debt={debt}
        payouts={payouts}
      />
    </div>
  );
}

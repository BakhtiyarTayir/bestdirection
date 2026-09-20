import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getMySalary } from "@/lib/api/salary.server";
import { MySalaryView } from "./my-salary-view";

export const dynamic = "force-dynamic";

export default async function MySalaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ADMIN включён: в небольшом центре занятия нередко ведёт сам
  // администратор (то же решение, что у groups.teacherOptions)
  await requireRole(["ADMIN", "TEACHER"]);
  const t = await getTranslations("salaries");

  const query = await searchParams;
  const month = typeof query.month === "string" && query.month ? query.month : undefined;

  const result = await getMySalary({ month });
  const data = result.success && result.data ? result.data : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("mySalary")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitleMe")}</p>
      </div>
      {data ? (
        <MySalaryView month={data.month} groups={data.groups} accruedTotal={data.accruedTotal} paidTotal={data.paidTotal} debt={data.debt} payouts={data.payouts} />
      ) : (
        <p className="text-muted-foreground">{t("empty")}</p>
      )}
    </div>
  );
}

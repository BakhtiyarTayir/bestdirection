import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getSalaryOverview } from "@/lib/api/salary.server";
import { getBranches } from "@/lib/api/branches.server";
import { SalariesList } from "./salaries-list";

export const dynamic = "force-dynamic";

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("salaries");

  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const [overviewResult, branchesResult] = await Promise.all([
    getSalaryOverview({ month: single("month"), branchId: single("branchId") }),
    getBranches(),
  ]);

  const data = overviewResult.success && overviewResult.data ? overviewResult.data : null;
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SalariesList
        month={data?.month ?? ""}
        rows={data?.rows ?? []}
        totals={data?.totals ?? { base: 0, accrued: 0, paid: 0, debt: 0 }}
        branchId={single("branchId")}
        branches={branches}
      />
    </div>
  );
}

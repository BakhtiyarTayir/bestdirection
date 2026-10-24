import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getFinance, getHandovers } from "@/lib/api/finance.server";
import { getBranches } from "@/lib/api/branches.server";
import { FinanceView } from "./finance-view";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("finance");

  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const [financeResult, branchesResult] = await Promise.all([
    getFinance({ month: single("month"), branchId: single("branchId") }),
    getBranches(),
  ]);

  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];
  // Журнал сдач — за месяц отчёта (его выбрал api, если в адресе месяца нет)
  const handoversResult = financeResult.success && financeResult.data
    ? await getHandovers({ month: financeResult.data.month, branchId: single("branchId") })
    : null;
  const handovers = handoversResult?.success && handoversResult.data ? handoversResult.data.handovers : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      {financeResult.success && financeResult.data ? (
        <FinanceView
          data={financeResult.data}
          branchId={single("branchId")}
          branches={branches}
          handovers={handovers}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{t("loadError")}</div>
      )}
    </div>
  );
}

import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getRefunds, getPaymentFormOptions } from "@/lib/api/billing.server";
import { getBranches } from "@/lib/api/branches.server";
import { paymentFiltersSchema } from "@/validators/payment";
import { RefundsList } from "./refunds-list";

export const dynamic = "force-dynamic";

// Только фильтры, которые поддерживает журнал возвратов
const refundFiltersSchema = paymentFiltersSchema.pick({
  month: true,
  q: true,
  courseId: true,
  method: true,
  branchId: true,
});

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("refunds");

  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  // Невалидные значения из URL игнорируем — показываем весь журнал
  const parsed = refundFiltersSchema.safeParse({
    month: single("month"),
    q: single("q"),
    courseId: single("courseId"),
    method: single("method"),
    branchId: single("branchId"),
  });
  const filters = parsed.success ? parsed.data : {};

  const [refundsResult, optionsResult, branchesResult] = await Promise.all([
    getRefunds(filters),
    getPaymentFormOptions(),
    getBranches(),
  ]);

  const data = refundsResult.success && refundsResult.data ? refundsResult.data : null;
  const courses = optionsResult.success && optionsResult.data ? optionsResult.data.courses : [];
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <RefundsList
        refunds={data?.refunds ?? []}
        total={data?.total ?? 0}
        count={data?.count ?? 0}
        filters={filters}
        courses={courses}
        branches={branches}
      />
    </div>
  );
}

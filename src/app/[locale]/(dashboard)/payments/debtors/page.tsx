import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getDebtors, getPaymentFormOptions } from "@/lib/api/billing.server";
import { getBranches } from "@/lib/api/branches.server";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { DebtorsList } from "./debtors-list";

export const dynamic = "force-dynamic";

export default async function DebtorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("debtors");

  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const [debtorsResult, optionsResult, branchesResult, teachersResult] = await Promise.all([
    getDebtors({
      month: single("month"),
      courseId: single("courseId"),
      branchId: single("branchId"),
      teacherId: single("teacherId"),
    }),
    getPaymentFormOptions(),
    getBranches(),
    getTeacherOptions(),
  ]);

  const data = debtorsResult.success && debtorsResult.data ? debtorsResult.data : null;
  const courses =
    optionsResult.success && optionsResult.data ? optionsResult.data.courses : [];
  // Студенты с их записями нужны диалогу оплаты: он открывается прямо из строки
  // должника с подставленными студентом, курсом и суммой долга.
  const students =
    optionsResult.success && optionsResult.data ? optionsResult.data.students : [];
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];
  const teachers = teachersResult.success && teachersResult.data ? teachersResult.data : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <DebtorsList
        month={data?.month ?? ""}
        debtors={data?.debtors ?? []}
        students={students}
        totalDebt={data?.totalDebt ?? 0}
        prepaidCount={data?.prepaidCount ?? 0}
        prepaidTotal={data?.prepaidTotal ?? 0}
        withoutGroup={data?.withoutGroup ?? 0}
        groupWithoutSchedule={data?.groupWithoutSchedule ?? 0}
        courseId={single("courseId")}
        courses={courses}
        branchId={single("branchId")}
        branches={branches}
        teacherId={single("teacherId")}
        teachers={teachers}
      />
    </div>
  );
}

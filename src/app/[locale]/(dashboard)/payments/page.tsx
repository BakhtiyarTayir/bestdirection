import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getPayments, getPaymentFormOptions } from "@/lib/api/billing.server";
import { getBranches } from "@/lib/api/branches.server";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { paymentFiltersSchema } from "@/validators/payment";
import { PaymentsList } from "./payments-list";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("payments");

  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  // Невалидные значения из URL просто игнорируем — показываем весь журнал
  const parsedFilters = paymentFiltersSchema.safeParse({
    month: single("month"),
    courseId: single("courseId"),
    method: single("method"),
    branchId: single("branchId"),
    teacherId: single("teacherId"),
  });
  const filters = parsedFilters.success ? parsedFilters.data : {};

  const [paymentsResult, optionsResult, branchesResult, teachersResult] = await Promise.all([
    getPayments(filters),
    getPaymentFormOptions(),
    getBranches(),
    getTeacherOptions(),
  ]);

  const paymentsData =
    paymentsResult.success && paymentsResult.data ? paymentsResult.data : null;
  const rows = paymentsData?.payments ?? [];
  const options =
    optionsResult.success && optionsResult.data
      ? optionsResult.data
      : { students: [], courses: [] };
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];
  const teachers = teachersResult.success && teachersResult.data ? teachersResult.data : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PaymentsList
        payments={rows.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          method: payment.method,
          // api отдаёт дату строкой ISO
          paidAt: payment.paidAt,
          forMonth: payment.forMonth,
          comment: payment.comment,
          student: {
            id: payment.student.id,
            firstName: payment.student.firstName,
            lastName: payment.student.lastName,
            phone: payment.student.phone,
          },
          course: { title: payment.course.title },
          group: payment.group ? { name: payment.group.name } : null,
          createdBy: {
            firstName: payment.createdBy.firstName,
            lastName: payment.createdBy.lastName,
          },
        }))}
        total={paymentsData?.total ?? 0}
        count={paymentsData?.count ?? 0}
        filters={filters}
        students={options.students}
        courses={options.courses}
        branches={branches}
        teachers={teachers}
      />
    </div>
  );
}

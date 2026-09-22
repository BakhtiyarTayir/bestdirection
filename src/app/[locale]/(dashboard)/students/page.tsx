import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getStudentsOverview } from "@/lib/api/billing.server";
import { getBranches } from "@/lib/api/branches.server";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BranchFilter } from "@/components/branch-filter";
import { StudentList, type StudentListRow } from "./student-list";

export const dynamic = "force-dynamic";

interface StudentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("students");
  const tCommon = await getTranslations("common");
  const tBilling = await getTranslations("studentBilling");

  const params = await searchParams;
  const branchId = typeof params.branchId === "string" && params.branchId ? params.branchId : undefined;

  const [result, branchesResult] = await Promise.all([getStudentsOverview(branchId), getBranches()]);
  const students = (result.success && result.data ? result.data : []) as StudentListRow[];
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mb-4">
        <BranchFilter branchId={branchId} branches={branches} namespace="students" />
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t("noStudents")}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{tCommon("number")}</TableHead>
                <TableHead>{tCommon("firstName")}</TableHead>
                <TableHead>{t("contacts")}</TableHead>
                <TableHead>{t("branch")}</TableHead>
                <TableHead>{t("courses")}</TableHead>
                <TableHead className="text-right">{tBilling("balance")}</TableHead>
                <TableHead className="text-right">{tCommon("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <StudentList students={students} />
          </Table>
        </div>
      )}
    </div>
  );
}

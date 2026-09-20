import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getBranches } from "@/lib/api/branches.server";
import { BranchList } from "./branch-list";
import { BranchFormDialog } from "./branch-form-dialog";

export const dynamic = "force-dynamic";

export default async function AdminBranchesPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("branches");

  const result = await getBranches();
  const branches = result.success && result.data ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <BranchFormDialog />
      </div>
      <BranchList initialBranches={branches} />
    </div>
  );
}

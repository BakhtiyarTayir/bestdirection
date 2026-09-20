import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getBranches } from "@/lib/api/branches.server";
import { CreateUserForm } from "./create-user-form";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireRole(["ADMIN"]);

  const branchesResult = await getBranches();
  const branches = (branchesResult.success && branchesResult.data ? branchesResult.data : []).filter(
    (branch) => branch.isActive
  );

  return <NewUserPageContent branches={branches} />;
}

async function NewUserPageContent({ branches }: { branches: { id: string; name: string }[] }) {
  const t = await getTranslations("users");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("createUser")}</h1>
      <CreateUserForm branches={branches} />
    </div>
  );
}

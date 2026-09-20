import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getBranches } from "@/lib/api/branches.server";
import { getUsersFormOptions } from "@/lib/api/users.server";
import type { ApiUsersFormOptions } from "@/lib/api/users";
import { CreateUserForm } from "./create-user-form";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireRole(["ADMIN"]);

  const [branchesResult, formOptionsResult] = await Promise.all([getBranches(), getUsersFormOptions()]);
  const branches = (branchesResult.success && branchesResult.data ? branchesResult.data : []).filter(
    (branch) => branch.isActive
  );
  const formOptions: ApiUsersFormOptions =
    formOptionsResult.success && formOptionsResult.data ? formOptionsResult.data : { courses: [], groups: [] };

  return <NewUserPageContent branches={branches} formOptions={formOptions} />;
}

async function NewUserPageContent({
  branches,
  formOptions,
}: {
  branches: { id: string; name: string }[];
  formOptions: ApiUsersFormOptions;
}) {
  const t = await getTranslations("users");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("createUser")}</h1>
      <CreateUserForm branches={branches} formOptions={formOptions} />
    </div>
  );
}

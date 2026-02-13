import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { CreateUserForm } from "./create-user-form";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireRole(["ADMIN"]);

  return <NewUserPageContent />;
}

async function NewUserPageContent() {
  const t = await getTranslations("users");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("createUser")}</h1>
      <CreateUserForm />
    </div>
  );
}

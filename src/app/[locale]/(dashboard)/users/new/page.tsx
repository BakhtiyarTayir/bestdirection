import { requireRole } from "@/lib/auth-guard";
import { useTranslations } from "next-intl";
import { CreateUserForm } from "./create-user-form";

export default async function NewUserPage() {
  await requireRole(["ADMIN"]);

  return <NewUserPageContent />;
}

function NewUserPageContent() {
  const t = useTranslations("users");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("createUser")}</h1>
      <CreateUserForm />
    </div>
  );
}

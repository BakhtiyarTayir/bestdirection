import { requireRole } from "@/lib/auth-guard";
import { getUserById } from "@/actions/user-actions";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { EditUserForm } from "./edit-user-form";

export const dynamic = "force-dynamic";

interface EditUserPageProps {
  params: Promise<{ userId: string }>;
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  await requireRole(["ADMIN"]);

  const { userId } = await params;
  const result = await getUserById(userId);

  if (!result.success || !result.data) {
    notFound();
  }

  const user = result.data;

  return <EditUserPageContent user={user} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditUserPageContent({ user }: { user: any }) {
  const t = useTranslations("users");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("editUser")}</h1>
      <EditUserForm user={user} />
    </div>
  );
}

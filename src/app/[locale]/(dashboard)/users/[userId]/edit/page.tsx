import { requireRole } from "@/lib/auth-guard";
import { getUserById } from "@/actions/user-actions";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { EditUserForm } from "./edit-user-form";

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

function EditUserPageContent({ user }: { user: NonNullable<Awaited<ReturnType<typeof getUserById>>["data"]> }) {
  const t = useTranslations("users");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("editUser")}</h1>
      <EditUserForm user={user} />
    </div>
  );
}

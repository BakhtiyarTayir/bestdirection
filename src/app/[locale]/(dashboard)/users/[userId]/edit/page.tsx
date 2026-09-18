import { requireRole } from "@/lib/auth-guard";
import { getUserById } from "@/lib/api/users.server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EditUserForm } from "./edit-user-form";
import { ParentsPanel } from "@/components/parents-panel";

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
async function EditUserPageContent({ user }: { user: any }) {
  const t = await getTranslations("users");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("editUser")}</h1>
      <EditUserForm user={user} />
      {/* Родители — только у учеников: у остальных ролей связь не имеет смысла */}
      {user.role === "STUDENT" && <ParentsPanel studentId={user.id} />}
    </div>
  );
}

import { requireRole } from "@/lib/auth-guard";
import { getUserById } from "@/actions/user-actions";
import { notFound } from "next/navigation";
import { EditUserForm } from "./edit-user-form";

interface EditUserPageProps {
  params: Promise<{ userId: string }>;
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  await requireRole(["ADMIN"]);

  const { userId } = await params;
  const user = await getUserById(userId);

  if (!user) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Редактирование пользователя</h1>
      <EditUserForm user={user} />
    </div>
  );
}

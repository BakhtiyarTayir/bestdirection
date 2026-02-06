import { requireRole } from "@/lib/auth-guard";
import { CreateUserForm } from "./create-user-form";

export default async function NewUserPage() {
  await requireRole(["ADMIN"]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Добавить пользователя</h1>
      <CreateUserForm />
    </div>
  );
}

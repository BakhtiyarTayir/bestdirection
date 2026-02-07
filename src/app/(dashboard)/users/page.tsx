import { requireRole } from "@/lib/auth-guard";
import { getUsers } from "@/actions/user-actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { UserList } from "./user-list";

export default async function UsersPage() {
  await requireRole(["ADMIN"]);

  const result = await getUsers();
  const users = result.success && result.data ? result.data : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Пользователи</h1>
        <Link href="/users/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Добавить пользователя
          </Button>
        </Link>
      </div>

      <UserList initialUsers={users} />
    </div>
  );
}

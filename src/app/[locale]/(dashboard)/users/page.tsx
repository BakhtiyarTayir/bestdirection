import { requireRole } from "@/lib/auth-guard";
import { getUsers } from "@/actions/user-actions";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { BarChart3, Plus } from "lucide-react";
import { UserList } from "./user-list";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const canManageUsers = session.user.role === "ADMIN";

  const result = await getUsers();
  const users = result.success && result.data ? result.data : [];

  return <UsersPageContent users={users} canManageUsers={canManageUsers} />;
}

async function UsersPageContent({
  users,
  canManageUsers,
}: {
  users: Array<{ id: string; number: number; firstName: string; lastName: string; email: string | null; role: string; isActive: boolean }>;
  canManageUsers: boolean;
}) {
  const t = await getTranslations("users");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Link href="/statistics">
            <Button variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              {t("statsTitle")}
            </Button>
          </Link>
          {canManageUsers && (
            <Link href="/users/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("createUser")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <UserList initialUsers={users} canManageUsers={canManageUsers} />
    </div>
  );
}

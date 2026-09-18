import { requireRole } from "@/lib/auth-guard";
import { getUsers, getDeactivatedUsers } from "@/lib/api/users.server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Plus } from "lucide-react";
import { UserList } from "./user-list";
import { DeactivatedUserList } from "./deactivated-user-list";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

interface ActiveUser {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
  isActive: boolean;
}

interface DeactivatedUser {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
  telegramChatId: string | null;
}

export default async function UsersPage() {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const canManageUsers = session.user.role === "ADMIN";

  // Вкладка деактивированных — только для администратора, поэтому и запрос
  // делаем только ему: преподавателю действие всё равно ответит "forbidden".
  const [usersResult, deactivatedResult] = await Promise.all([
    getUsers(),
    canManageUsers ? getDeactivatedUsers() : null,
  ]);

  const allUsers = usersResult.success && usersResult.data ? usersResult.data : [];
  const activeUsers = allUsers.filter((user) => user.isActive);
  const deactivatedUsers =
    deactivatedResult?.success && deactivatedResult.data ? deactivatedResult.data : [];

  return (
    <UsersPageContent
      users={activeUsers}
      deactivatedUsers={deactivatedUsers}
      canManageUsers={canManageUsers}
    />
  );
}

async function UsersPageContent({
  users,
  deactivatedUsers,
  canManageUsers,
}: {
  users: ActiveUser[];
  deactivatedUsers: DeactivatedUser[];
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

      {canManageUsers ? (
        <Tabs defaultValue="active">
          <TabsList className="mb-4">
            <TabsTrigger value="active">
              {t("tabActive")} ({users.length})
            </TabsTrigger>
            <TabsTrigger value="deactivated">
              {t("tabDeactivated")} ({deactivatedUsers.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            <UserList initialUsers={users} canManageUsers />
          </TabsContent>
          <TabsContent value="deactivated">
            <p className="mb-4 text-sm text-muted-foreground">
              {t("deactivatedHint")}
            </p>
            <DeactivatedUserList users={deactivatedUsers} />
          </TabsContent>
        </Tabs>
      ) : (
        <UserList initialUsers={users} canManageUsers={false} />
      )}
    </div>
  );
}

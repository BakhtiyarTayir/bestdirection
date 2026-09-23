import { requireRole } from "@/lib/auth-guard";
import { getUsers, getDeactivatedUsers } from "@/lib/api/users.server";
import { getBranches } from "@/lib/api/branches.server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Plus } from "lucide-react";
import { UserList } from "./user-list";
import { DeactivatedUserList } from "./deactivated-user-list";
import { BranchFilter } from "@/components/branch-filter";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

interface ActiveUser {
  id: string;
  firstName: string;
  lastName: string;
  login: string | null;
  role: string;
  isActive: boolean;
  branch: { id: string; name: string } | null;
}

interface DeactivatedUser {
  id: string;
  firstName: string;
  lastName: string;
  login: string | null;
  role: string;
  telegramChatId: string | null;
}

interface UsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const canManageUsers = session.user.role === "ADMIN";

  const params = await searchParams;
  const branchId = typeof params.branchId === "string" && params.branchId ? params.branchId : undefined;

  // Вкладка деактивированных — только для администратора, поэтому и запрос
  // делаем только ему: преподавателю действие всё равно ответит "forbidden".
  const [usersResult, deactivatedResult, branchesResult] = await Promise.all([
    getUsers(branchId),
    canManageUsers ? getDeactivatedUsers() : null,
    getBranches(),
  ]);

  const allUsers = usersResult.success && usersResult.data ? usersResult.data : [];
  const activeUsers = allUsers.filter((user) => user.isActive);
  const deactivatedUsers =
    deactivatedResult?.success && deactivatedResult.data ? deactivatedResult.data : [];
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];

  return (
    <UsersPageContent
      users={activeUsers}
      deactivatedUsers={deactivatedUsers}
      canManageUsers={canManageUsers}
      branchId={branchId}
      branches={branches}
    />
  );
}

async function UsersPageContent({
  users,
  deactivatedUsers,
  canManageUsers,
  branchId,
  branches,
}: {
  users: ActiveUser[];
  deactivatedUsers: DeactivatedUser[];
  canManageUsers: boolean;
  branchId?: string;
  branches: { id: string; name: string }[];
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
            <UserList
              initialUsers={users}
              canManageUsers
              filterPrefix={<BranchFilter branchId={branchId} branches={branches} namespace="users" />}
            />
          </TabsContent>
          <TabsContent value="deactivated">
            <p className="mb-4 text-sm text-muted-foreground">
              {t("deactivatedHint")}
            </p>
            <DeactivatedUserList users={deactivatedUsers} />
          </TabsContent>
        </Tabs>
      ) : (
        <UserList
          initialUsers={users}
          canManageUsers={false}
          filterPrefix={<BranchFilter branchId={branchId} branches={branches} namespace="users" />}
        />
      )}
    </div>
  );
}

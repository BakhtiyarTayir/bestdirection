import { requireRole } from "@/lib/auth-guard";
import { getUsers } from "@/actions/user-actions";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { UserList } from "./user-list";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRole(["ADMIN"]);

  const result = await getUsers();
  const users = result.success && result.data ? result.data : [];

  return <UsersPageContent users={users} />;
}

async function UsersPageContent({ users }: { users: Array<{ id: string; firstName: string; lastName: string; email: string; role: string; isActive: boolean }> }) {
  const t = await getTranslations("users");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <Link href="/users/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("createUser")}
          </Button>
        </Link>
      </div>

      <UserList initialUsers={users} />
    </div>
  );
}

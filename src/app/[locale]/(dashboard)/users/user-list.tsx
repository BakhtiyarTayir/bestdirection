"use client";

import { useOptimistic, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { deactivateUser } from "@/lib/api/users";
import { Pencil, UserX, Loader2 } from "lucide-react";

const roleBadgeVariant: Record<string, "destructive" | "default" | "secondary"> = {
  ADMIN: "destructive",
  TEACHER: "default",
  STUDENT: "secondary",
};

interface User {
  id: string;
  firstName: string;
  lastName: string;
  login: string | null;
  role: string;
  isActive: boolean;
  branch?: { id: string; name: string } | null;
}

interface UserListProps {
  initialUsers: User[];
  canManageUsers?: boolean;
}

export function UserList({ initialUsers, canManageUsers = true }: UserListProps) {
  const t = useTranslations("users");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [optimisticUsers, removeUser] = useOptimistic(
    initialUsers,
    (state: User[], removedId: string) =>
      state.filter((u) => u.id !== removedId)
  );
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleDeactivate = async () => {
    if (!selectedUser) return;
    const userId = selectedUser.id;
    const userName = `${selectedUser.firstName} ${selectedUser.lastName}`;

    setDeactivatingId(userId);
    setDialogOpen(false);
    removeUser(userId);

    try {
      const result = await deactivateUser(userId);
      if (result.success) {
        toast({
          title: t("userDeactivated"),
          description: t("userDeactivatedDescription", { name: userName }),
        });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: t("deactivateFailed"),
          variant: "destructive",
        });
        router.refresh();
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
      router.refresh();
    } finally {
      setDeactivatingId(null);
      setSelectedUser(null);
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{tCommon("number")}</TableHead>
              <TableHead>{tCommon("firstName")}</TableHead>
              <TableHead>{tCommon("login")}</TableHead>
              <TableHead>{t("branch")}</TableHead>
              <TableHead>{tCommon("role")}</TableHead>
              <TableHead>{tCommon("status")}</TableHead>
              {canManageUsers && <TableHead className="text-right">{tCommon("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {optimisticUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManageUsers ? 7 : 6} className="text-center text-muted-foreground">
                  {t("noUsersFound")}
                </TableCell>
              </TableRow>
            ) : (
              optimisticUsers.map((user, index) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>{user.login}</TableCell>
                  <TableCell className="text-muted-foreground">{user.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant[user.role] ?? "secondary"}>
                      {tRoles(user.role as "ADMIN" | "TEACHER" | "STUDENT")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "default" : "outline"}>
                      {user.isActive ? tCommon("active") : tCommon("inactive")}
                    </Badge>
                  </TableCell>
                  {canManageUsers && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/users/${user.id}/edit`}>
                          <Button variant="outline" size="sm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deactivatingId === user.id}
                          onClick={() => {
                            setSelectedUser(user);
                            setDialogOpen(true);
                          }}
                        >
                          {deactivatingId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserX className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deactivateUser")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deactivateUserConfirm", { name: `${selectedUser?.firstName} ${selectedUser?.lastName}` })}
              {" "}{t("deactivateReversible")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>
              {t("deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

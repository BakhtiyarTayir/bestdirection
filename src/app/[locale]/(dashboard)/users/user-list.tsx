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
import { deleteUser } from "@/actions/user-actions";
import { Pencil, Trash2, Loader2 } from "lucide-react";

const roleBadgeVariant: Record<string, "destructive" | "default" | "secondary"> = {
  ADMIN: "destructive",
  TEACHER: "default",
  STUDENT: "secondary",
};

interface User {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
  isActive: boolean;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleDelete = async () => {
    if (!selectedUser) return;
    const userId = selectedUser.id;
    const userName = `${selectedUser.firstName} ${selectedUser.lastName}`;

    setDeletingId(userId);
    setDialogOpen(false);
    removeUser(userId);

    try {
      const result = await deleteUser(userId);
      if (result.success) {
        toast({
          title: t("userDeleted"),
          description: t("userDeletedDescription", { name: userName }),
        });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error ?? t("deleteFailed"),
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
      setDeletingId(null);
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
              <TableHead>{tCommon("email")}</TableHead>
              <TableHead>{tCommon("role")}</TableHead>
              <TableHead>{tCommon("status")}</TableHead>
              {canManageUsers && <TableHead className="text-right">{tCommon("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {optimisticUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManageUsers ? 6 : 5} className="text-center text-muted-foreground">
                  {t("noUsersFound")}
                </TableCell>
              </TableRow>
            ) : (
              optimisticUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {user.number}
                  </TableCell>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
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
                          disabled={deletingId === user.id}
                          onClick={() => {
                            setSelectedUser(user);
                            setDialogOpen(true);
                          }}
                        >
                          {deletingId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
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
            <AlertDialogTitle>{t("deleteUser")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteUserConfirm", { name: `${selectedUser?.firstName} ${selectedUser?.lastName}` })}
              {" "}{t("deleteIrreversible")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

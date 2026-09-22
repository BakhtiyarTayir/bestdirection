"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
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
import { restoreUser, purgeUser } from "@/lib/api/users";
import { RotateCcw, Trash2, Loader2 } from "lucide-react";

const roleBadgeVariant: Record<string, "destructive" | "default" | "secondary"> = {
  ADMIN: "destructive",
  TEACHER: "default",
  STUDENT: "secondary",
};

interface DeactivatedUser {
  id: string;
  firstName: string;
  lastName: string;
  login: string | null;
  role: string;
  telegramChatId: string | null;
}

interface DeactivatedUserListProps {
  users: DeactivatedUser[];
}

export function DeactivatedUserList({ users }: DeactivatedUserListProps) {
  const t = useTranslations("users");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeactivatedUser | null>(null);

  // Причины отказа приходят от серверного действия кодами — переводим их
  // здесь, потому что пользователю нужно понимать, что именно мешает.
  const purgeErrorMessage = (code?: string) => {
    switch (code) {
      case "userHasProtectedRecords":
        return t("purgeBlockedByRecords");
      case "userIsActive":
        return t("purgeBlockedActive");
      case "cannotPurgeSelf":
        return t("purgeBlockedSelf");
      case "userNotFound":
        return t("userNotFound");
      default:
        return t("purgeFailed");
    }
  };

  const handleRestore = async (user: DeactivatedUser) => {
    const name = `${user.firstName} ${user.lastName}`;
    setPendingId(user.id);

    try {
      const result = await restoreUser(user.id);
      if (result.success) {
        toast({
          title: t("userRestored"),
          description: t("userRestoredDescription", { name }),
        });
      } else {
        toast({
          title: tErrors("error"),
          description: t("restoreFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
      router.refresh();
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    const user = purgeTarget;
    const name = `${user.firstName} ${user.lastName}`;

    setPendingId(user.id);
    setPurgeTarget(null);

    try {
      const result = await purgeUser(user.id);
      if (result.success) {
        toast({
          title: t("userPurged"),
          description: t("userPurgedDescription", { name }),
        });
      } else {
        toast({
          title: tErrors("error"),
          description: purgeErrorMessage(result.error),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
      router.refresh();
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
              <TableHead>{tCommon("role")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("noDeactivatedUsers")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user, index) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>
                    <div>{user.login}</div>
                    {user.telegramChatId && (
                      <div className="text-xs text-muted-foreground">
                        {t("telegramLinked")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant[user.role] ?? "secondary"}>
                      {tRoles(user.role as "ADMIN" | "TEACHER" | "STUDENT")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pendingId === user.id}
                        onClick={() => handleRestore(user)}
                      >
                        {pendingId === user.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-2 h-4 w-4" />
                        )}
                        {tCommon("restore")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pendingId === user.id}
                        onClick={() => setPurgeTarget(user)}
                      >
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        {t("purgeUser")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("purgeUserTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("purgeUserConfirm", {
                name: `${purgeTarget?.firstName ?? ""} ${purgeTarget?.lastName ?? ""}`.trim(),
              })}
              {" "}
              {t("purgeWhatIsLost")}
              {" "}
              <span className="font-medium text-destructive">
                {t("purgeIrreversible")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("purgeUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

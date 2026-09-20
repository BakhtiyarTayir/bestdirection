"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { deleteBranch, updateBranch, type ApiBranch } from "@/lib/api/branches";
import { Pencil, Power, Trash2 } from "lucide-react";
import { BranchFormDialog } from "./branch-form-dialog";

interface BranchListProps {
  initialBranches: ApiBranch[];
}

export function BranchList({ initialBranches }: BranchListProps) {
  const t = useTranslations("branches");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<ApiBranch | null>(null);
  const [deleting, setDeleting] = useState<ApiBranch | null>(null);

  const handleToggleActive = (branch: ApiBranch) => {
    startTransition(async () => {
      const result = await updateBranch(branch.id, { isActive: !branch.isActive });
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
        return;
      }
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleting) return;
    const branch = deleting;
    setDeleting(null);
    startTransition(async () => {
      const result = await deleteBranch(branch.id);
      if (!result.success) {
        // branchHasGroups — понятная ошибка вместо 500 (ловушка 3.8.6 плана филиалов)
        const message = tErrors.has(result.error) ? tErrors(result.error) : result.error;
        toast({ title: tErrors("error"), description: message, variant: "destructive" });
        return;
      }
      toast({ title: t("branchDeleted") });
      router.refresh();
    });
  };

  if (initialBranches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {t("noBranches")}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("branchName")}</TableHead>
              <TableHead>{t("branchAddress")}</TableHead>
              <TableHead>{t("branchPhone")}</TableHead>
              <TableHead>{tCommon("status")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialBranches.map((branch) => (
              <TableRow key={branch.id} className={!branch.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{branch.name}</TableCell>
                <TableCell>{branch.address || "—"}</TableCell>
                <TableCell>{branch.phone || "—"}</TableCell>
                <TableCell>
                  <Badge variant={branch.isActive ? "default" : "outline"}>
                    {branch.isActive ? tCommon("active") : tCommon("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(branch)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleToggleActive(branch)}>
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleting(branch)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <BranchFormDialog
          key={editing.id}
          branch={editing}
          trigger={false}
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteBranch")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteBranchConfirm", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{tCommon("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

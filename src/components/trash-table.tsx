"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/format-date";
import { useTranslations } from "next-intl";

interface TrashItem {
  id: string;
  title?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  deletedAt: Date | null;
  [key: string]: unknown;
}

interface TrashTableProps {
  items: TrashItem[];
  type: "course" | "user" | "lesson";
  onRestore: (id: string) => Promise<{ success: boolean; error?: string }>;
  onHardDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
}

// typeLabels moved to component body using translations

function getItemName(item: TrashItem, type: string, noTitle: string): string {
  if (type === "user") {
    return `${item.firstName ?? ""} ${item.lastName ?? ""} (${item.email ?? ""})`.trim();
  }
  return (item.title as string) ?? noTitle;
}

function formatDeletedAt(date: Date | null): string {
  if (!date) return "—";
  return formatDateTime(date);
}

export function TrashTable({ items, type, onRestore, onHardDelete }: TrashTableProps) {
  const t = useTranslations("trash");
  const tCommon = useTranslations("common");
  const [localItems, setLocalItems] = useState(items);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const typeLabels: Record<string, string> = {
    course: t("courseType"),
    user: t("userType"),
    lesson: t("lessonType"),
  };

  const handleRestore = (id: string) => {
    startTransition(async () => {
      const result = await onRestore(id);
      if (result.success) {
        setLocalItems((prev) => prev.filter((item) => item.id !== id));
        toast({ title: t("restored") });
      } else {
        toast({ title: result.error ?? t("restoreError"), variant: "destructive" });
      }
    });
  };

  const handleHardDelete = (id: string) => {
    startTransition(async () => {
      const result = await onHardDelete(id);
      if (result.success) {
        setLocalItems((prev) => prev.filter((item) => item.id !== id));
        toast({ title: t("deletedPermanently") });
      } else {
        toast({ title: result.error ?? t("deleteError"), variant: "destructive" });
      }
    });
  };

  if (localItems.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        {t("noDeletedItems")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tCommon("name")}</TableHead>
          <TableHead>{t("deletedAt")}</TableHead>
          <TableHead className="text-right">{tCommon("actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {localItems.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">
              {getItemName(item, type, tCommon("noTitle"))}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDeletedAt(item.deletedAt)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(item.id)}
                  disabled={isPending}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {tCommon("restore")}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("deletePermanently")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deletePermanentlyConfirm")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("deletePermanentlyDescription", { type: typeLabels[type], name: getItemName(item, type, tCommon("noTitle")) })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleHardDelete(item.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("deletePermanently")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

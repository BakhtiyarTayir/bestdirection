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

const typeLabels: Record<string, string> = {
  course: "курс",
  user: "пользователя",
  lesson: "урок",
};

function getItemName(item: TrashItem, type: string): string {
  if (type === "user") {
    return `${item.firstName ?? ""} ${item.lastName ?? ""} (${item.email ?? ""})`.trim();
  }
  return (item.title as string) ?? "Без названия";
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TrashTable({ items, type, onRestore, onHardDelete }: TrashTableProps) {
  const [localItems, setLocalItems] = useState(items);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleRestore = (id: string) => {
    startTransition(async () => {
      const result = await onRestore(id);
      if (result.success) {
        setLocalItems((prev) => prev.filter((item) => item.id !== id));
        toast({ title: "Успешно восстановлено" });
      } else {
        toast({ title: result.error ?? "Ошибка восстановления", variant: "destructive" });
      }
    });
  };

  const handleHardDelete = (id: string) => {
    startTransition(async () => {
      const result = await onHardDelete(id);
      if (result.success) {
        setLocalItems((prev) => prev.filter((item) => item.id !== id));
        toast({ title: "Удалено навсегда" });
      } else {
        toast({ title: result.error ?? "Ошибка удаления", variant: "destructive" });
      }
    });
  };

  if (localItems.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Нет удалённых записей
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead>Дата удаления</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {localItems.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">
              {getItemName(item, type)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(item.deletedAt)}
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
                  Восстановить
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Удалить навсегда
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить навсегда?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Вы собираетесь безвозвратно удалить {typeLabels[type]}{" "}
                        &quot;{getItemName(item, type)}&quot;. Это действие нельзя
                        отменить.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleHardDelete(item.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Удалить навсегда
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

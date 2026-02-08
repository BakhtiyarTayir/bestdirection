"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  changes: unknown;
  metadata: unknown;
  createdAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface AuditTableProps {
  logs: AuditLog[];
  currentPage: number;
  totalPages: number;
  entityType?: string;
  action?: string;
}

const ENTITY_TYPES = ["Course", "Lesson", "Assessment", "User"];
const ACTIONS = ["CREATE", "UPDATE", "DELETE"];

function actionBadgeVariant(action: string) {
  switch (action) {
    case "CREATE":
      return "default" as const;
    case "UPDATE":
      return "secondary" as const;
    case "DELETE":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function actionLabel(action: string) {
  switch (action) {
    case "CREATE":
      return "Создание";
    case "UPDATE":
      return "Изменение";
    case "DELETE":
      return "Удаление";
    default:
      return action;
  }
}

function formatChanges(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "";
  const entries = Object.entries(changes as Record<string, { old: unknown; new: unknown }>);
  return entries
    .map(([key, val]) => `${key}: ${JSON.stringify(val.old)} → ${JSON.stringify(val.new)}`)
    .join("; ");
}

function formatMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const entries = Object.entries(metadata as Record<string, unknown>);
  return entries.map(([key, val]) => `${key}: ${JSON.stringify(val)}`).join("; ");
}

export function AuditTable({ logs, currentPage, totalPages, entityType, action }: AuditTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/audit?${params.toString()}`);
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/audit?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={entityType || "all"}
          onValueChange={(v) => updateFilter("entityType", v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Тип объекта" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={action || "all"}
          onValueChange={(v) => updateFilter("action", v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Действие" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все действия</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {actionLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Пользователь</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>ID объекта</TableHead>
              <TableHead>Изменения</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Записи не найдены
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(log.createdAt).toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.user.firstName} {log.user.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionBadgeVariant(log.action)}>
                      {actionLabel(log.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{log.entityType}</TableCell>
                  <TableCell className="text-sm font-mono text-xs">
                    {log.entityId.slice(0, 8)}...
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate">
                    {log.changes ? formatChanges(log.changes) : formatMetadata(log.metadata)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Страница {currentPage} из {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

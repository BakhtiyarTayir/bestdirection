"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
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
import { formatDateTime } from "@/lib/format-date";
import { useTranslations } from "next-intl";

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
    email: string | null;
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

// actionLabel moved to component body using translations

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
  const t = useTranslations("audit");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  function actionLabel(action: string) {
    switch (action) {
      case "CREATE":
        return t("actionCreate");
      case "UPDATE":
        return t("actionUpdate");
      case "DELETE":
        return t("actionDelete");
      default:
        return action;
    }
  }

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
            <SelectValue placeholder={t("entityType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTypes")}</SelectItem>
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
            <SelectValue placeholder={t("action")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allActions")}</SelectItem>
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
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("user")}</TableHead>
              <TableHead>{t("action")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("entityId")}</TableHead>
              <TableHead>{t("changes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t("noLogs")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(log.createdAt)}
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
            {tCommon("page", { page: currentPage, totalPages })}
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

"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/format-date";
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
import { useToast } from "@/components/ui/use-toast";
import { markLeadContacted } from "@/lib/api/marketing";
import { Loader2 } from "lucide-react";

interface Lead {
  id: string;
  fullName: string;
  phone: string;
  message: string | null;
  contacted: boolean;
  // api отдаёт дату строкой
  createdAt: string | Date;
  courseName: string;
}

interface LeadListProps {
  initialLeads: Lead[];
}

export function LeadList({ initialLeads }: LeadListProps) {
  const t = useTranslations("leads");
  const { toast } = useToast();
  const [leads, setLeads] = useState(initialLeads);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleToggle = (id: string, contacted: boolean) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await markLeadContacted(id, contacted);
      if (result.success) {
        setLeads((prev) =>
          prev.map((lead) => (lead.id === id ? { ...lead, contacted } : lead))
        );
      } else {
        toast({ variant: "destructive", description: result.error });
      }
      setPendingId(null);
    });
  };

  if (leads.length === 0) {
    return <p className="text-muted-foreground">{t("noLeads")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("dateColumn")}</TableHead>
          <TableHead>{t("courseColumn")}</TableHead>
          <TableHead>{t("nameColumn")}</TableHead>
          <TableHead>{t("phoneColumn")}</TableHead>
          <TableHead>{t("messageColumn")}</TableHead>
          <TableHead>{t("statusColumn")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell className="whitespace-nowrap">
              {formatDateTime(lead.createdAt)}
            </TableCell>
            <TableCell>{lead.courseName}</TableCell>
            <TableCell>{lead.fullName}</TableCell>
            <TableCell>{lead.phone}</TableCell>
            <TableCell className="max-w-xs truncate">{lead.message || "—"}</TableCell>
            <TableCell>
              <Badge variant={lead.contacted ? "secondary" : "default"}>
                {lead.contacted ? t("contacted") : t("notContacted")}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === lead.id}
                onClick={() => handleToggle(lead.id, !lead.contacted)}
              >
                {pendingId === lead.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {lead.contacted ? t("markNotContacted") : t("markContacted")}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

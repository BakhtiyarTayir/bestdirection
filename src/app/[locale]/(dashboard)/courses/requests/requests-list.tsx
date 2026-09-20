"use client";

import { useState, useTransition } from "react";
import { intlLocale } from "@/i18n/config";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/format-date";
import { Check, X, Loader2 } from "lucide-react";
import {
  approveEnrollmentRequest,
  rejectEnrollmentRequest,
} from "@/lib/api/courses";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

interface RequestRow {
  id: string;
  status: RequestStatus;
  createdAt: string;
  course: { title: string; price: number | null };
  student: {
    firstName: string;
    lastName: string;
    login: string | null;
    phone: string | null;
    telegramUsername: string | null;
  };
}

export function RequestsList({ requests }: { requests: RequestRow[] }) {
  const t = useTranslations("enrollmentRequests");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState(requests);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const priceFormatter = new Intl.NumberFormat(intlLocale(locale));

  const statusBadge = (status: RequestStatus) => {
    switch (status) {
      case "PENDING":
        return <Badge>{t("statusPending")}</Badge>;
      case "APPROVED":
        return <Badge variant="secondary">{t("statusApproved")}</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">{t("statusRejected")}</Badge>;
    }
  };

  const decide = (id: string, approve: boolean) => {
    setPendingId(id);
    startTransition(async () => {
      const result = approve
        ? await approveEnrollmentRequest(id)
        : await rejectEnrollmentRequest(id);

      if (result.success) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: approve ? "APPROVED" : "REJECTED" }
              : r
          )
        );
        toast({ title: approve ? t("approvedToast") : t("rejectedToast") });
      } else {
        toast({
          title:
            result.error === "noSeatsLeft" ? t("noSeatsLeft") : t("actionFailed"),
          variant: "destructive",
        });
      }
      setPendingId(null);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colDate")}</TableHead>
            <TableHead>{t("colCourse")}</TableHead>
            <TableHead>{t("colStudent")}</TableHead>
            <TableHead>{t("colContacts")}</TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead className="text-right">{t("colActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">
                {formatDateTime(row.createdAt)}
              </TableCell>
              <TableCell>
                <div className="font-medium">{row.course.title}</div>
                {row.course.price !== null && (
                  <div className="text-sm text-muted-foreground">
                    {priceFormatter.format(row.course.price)} UZS
                  </div>
                )}
              </TableCell>
              <TableCell>
                {row.student.lastName} {row.student.firstName}
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {row.student.phone && <div>{row.student.phone}</div>}
                  {row.student.login && (
                    <div className="text-muted-foreground">{row.student.login}</div>
                  )}
                  {row.student.telegramUsername && (
                    <div className="text-muted-foreground">
                      @{row.student.telegramUsername}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>{statusBadge(row.status)}</TableCell>
              <TableCell className="text-right">
                {row.status === "PENDING" && (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide(row.id, true)}
                      disabled={pendingId === row.id}
                    >
                      {pendingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-4 w-4" />
                      )}
                      {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(row.id, false)}
                      disabled={pendingId === row.id}
                    >
                      <X className="mr-1 h-4 w-4" />
                      {t("reject")}
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

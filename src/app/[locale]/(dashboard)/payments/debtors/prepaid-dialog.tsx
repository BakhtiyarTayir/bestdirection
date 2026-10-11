"use client";

import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ApiPrepaidRow } from "@/lib/api/billing";

interface PrepaidDialogProps {
  rows: ApiPrepaidRow[];
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Ученики с авансом и оплаты, из которых он сложился, с именем принявшего. */
export function PrepaidDialog({ rows, total, open, onOpenChange }: PrepaidDialogProps) {
  const t = useTranslations("debtors");
  const tPayments = useTranslations("payments");
  const locale = useLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("prepaidDialogTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("prepaidDialogTotal", { amount: money.format(total) })}
          </p>
        </DialogHeader>
        {/* Обычный div: ScrollArea от Radix не прокручивается при max-height */}
        <div className="max-h-[60vh] overflow-y-auto pr-3">
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.enrollmentId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/payments/students/${row.student.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.student.lastName} {row.student.firstName}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {row.student.phone ?? t("noPhone")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {row.course.title} · {row.group?.name ?? t("noGroup")}
                    </div>
                  </div>
                  <Badge variant="secondary">{money.format(row.advance)} UZS</Badge>
                </div>
                <div className="mt-2 space-y-1 border-t pt-2">
                  {row.payments.length === 0 && (
                    <div className="text-sm text-muted-foreground">{t("prepaidNoPayments")}</div>
                  )}
                  {row.payments.map((payment) => (
                    <div key={payment.id} className="flex flex-wrap justify-between gap-x-3 text-sm">
                      <span className="text-muted-foreground">
                        {formatDate(payment.paidAt)} · {tPayments(`method.${payment.method}`)}
                        {payment.forMonth && ` · ${t("prepaidForMonth", { month: payment.forMonth.split("-").reverse().join(".") })}`}
                        {" · "}
                        {t("prepaidAcceptedBy", {
                          name: `${payment.createdBy.lastName} ${payment.createdBy.firstName}`,
                        })}
                      </span>
                      <span className="whitespace-nowrap">{money.format(payment.amount)} UZS</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

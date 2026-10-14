"use client";

import { useTranslations, useLocale } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { useRouter } from "@/i18n/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { useToast } from "@/components/ui/use-toast";
import { Trash2 } from "lucide-react";
import type { ApiSalaryAdjustment } from "@/lib/api/salary";
import { deleteSalaryAdjustment } from "@/lib/api/salary";

/**
 * Премии и штрафы по месяцам ≤ month отдельно: в итоги «Начислено» идут только
 * они (корректировка будущего месяца в итог не входит, но в списке видна).
 */
export function adjustmentTotals(adjustments: ApiSalaryAdjustment[], month: string) {
  let bonus = 0;
  let penalty = 0;
  for (const item of adjustments) {
    if (item.month > month) continue;
    if (item.kind === "BONUS") bonus += item.amount;
    else penalty += item.amount;
  }
  return { bonus, penalty, any: bonus > 0 || penalty > 0 };
}

/** Мелкая строка под итогом «Начислено»: «по группам X · премии +Y · штрафы −Z» */
export function AccruedBreakdown({
  adjustments,
  month,
  accruedFromGroups,
}: {
  adjustments: ApiSalaryAdjustment[];
  month: string;
  accruedFromGroups: number;
}) {
  const t = useTranslations("salaries");
  const locale = useLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));
  const totals = adjustmentTotals(adjustments, month);
  // Нет корректировок ≤ M — строка только повторяла бы итог
  if (!totals.any) return null;

  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {t("accruedBreakdown", {
        groups: money.format(accruedFromGroups),
        bonus: money.format(totals.bonus),
        penalty: money.format(totals.penalty),
      })}
    </div>
  );
}

interface AdjustmentsSectionProps {
  adjustments: ApiSalaryAdjustment[];
  /** Только администратор может удалять; у преподавателя блок read-only */
  canDelete?: boolean;
}

/** Блок «Премии и штрафы»: месяц, тип, сумма, причина, кто внёс, удаление. */
export function AdjustmentsSection({ adjustments, canDelete = false }: AdjustmentsSectionProps) {
  const t = useTranslations("salaries");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const money = new Intl.NumberFormat(intlLocale(locale));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("adjustmentsJournal")}</h2>
      {adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAdjustments")}</p>
      ) : (
        // На узком экране таблица прокручивается внутри блока, а не ломает страницу
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colMonth")}</TableHead>
                <TableHead>{t("colKind")}</TableHead>
                <TableHead className="text-right">{t("colAmount")}</TableHead>
                <TableHead>{t("colReason")}</TableHead>
                <TableHead>{t("recordedBy")}</TableHead>
                {canDelete && <TableHead className="text-right">{t("colActions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((item) => {
                const bonus = item.kind === "BONUS";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{item.month}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className={bonus ? "font-medium text-green-600" : "font-medium text-red-600"}>
                        {bonus ? `+ ${t("kindBonus")}` : `− ${t("kindPenalty")}`}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right font-medium ${bonus ? "text-green-600" : "text-red-600"}`}
                    >
                      {bonus ? "+" : "−"}
                      {money.format(item.amount)}
                    </TableCell>
                    <TableCell className="min-w-[200px] whitespace-pre-wrap break-words">{item.reason}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.createdBy}</TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t("deleteAdjustment")}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("deleteAdjustment")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("deleteAdjustmentConfirm")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  const result = await deleteSalaryAdjustment(item.id);
                                  if (result.success) {
                                    toast({ title: t("adjustmentDeleted") });
                                    router.refresh();
                                  } else {
                                    toast({
                                      title: tErrors("error"),
                                      description: tErrors.has(result.error)
                                        ? tErrors(result.error as never)
                                        : tErrors("unexpected"),
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                {tCommon("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

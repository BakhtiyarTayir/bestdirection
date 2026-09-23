"use client";

import { Fragment, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { useRouter, usePathname } from "@/i18n/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDate } from "@/lib/format-date";
import { Pencil, RefreshCw, TriangleAlert, Trash2 } from "lucide-react";
import type { ApiSalaryGroup, ApiSalaryPayout } from "@/lib/api/salary";
import { deletePayout, recalculateSalaryMonth, setManualSalaryAmount } from "@/lib/api/salary";
import { CreatePayoutDialog } from "./create-payout-dialog";

interface TeacherSalaryViewProps {
  teacherId: string;
  month: string;
  groups: ApiSalaryGroup[];
  accruedTotal: number;
  paidTotal: number;
  debt: number;
  payouts: ApiSalaryPayout[];
}

/** Процент из базисных пунктов строкой с одним знаком после запятой */
function percentText(bp: number | null): string {
  if (bp === null) return "";
  return (bp / 100).toFixed(1).replace(/\.0$/, "");
}

export function TeacherSalaryView({
  teacherId,
  month,
  groups,
  accruedTotal,
  paidTotal,
  debt,
  payouts,
}: TeacherSalaryViewProps) {
  const t = useTranslations("salaries");
  const tCommon = useTranslations("common");
  const tPayments = useTranslations("payments");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const money = new Intl.NumberFormat(intlLocale(locale));

  const setMonth = (value: string) => {
    startTransition(() => {
      router.replace(value ? `${pathname}?month=${value}` : pathname);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="salary-month" className="text-xs text-muted-foreground">
            {t("filterMonth")}
          </Label>
          <Input
            id="salary-month"
            type="month"
            className="w-40"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <CreatePayoutDialog teacherId={teacherId} defaultAmount={debt > 0 ? debt : undefined} defaultForMonth={month} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("accruedToDate", { month })}</div>
          <div className="text-2xl font-bold">{money.format(accruedTotal)} UZS</div>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("paidToDate", { month })}</div>
          <div className="text-2xl font-bold">{money.format(paidTotal)} UZS</div>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <div className="text-sm text-muted-foreground">{t("debtToDate", { month })}</div>
          <div className="text-2xl font-bold">{money.format(debt)} UZS</div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("byGroups")}</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
        ) : (
          groups.map((group) => (
            <div key={`${group.courseId}:${group.groupId ?? "none"}`} className="rounded-lg border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
                <div>
                  <div className="font-medium">
                    {group.courseTitle}
                    {group.groupName ? ` — ${group.groupName}` : ` (${t("withoutGroup")})`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.groupPercentBp !== null
                      ? t("groupOwnRate", { percent: percentText(group.groupPercentBp) })
                      : t("groupNoOwnRate")}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colMonth")}</TableHead>
                      <TableHead className="text-right">{t("colStudents")}</TableHead>
                      <TableHead className="text-right">{t("colBase")}</TableHead>
                      <TableHead className="text-right">{t("colRate")}</TableHead>
                      {/* Раскладка по занятиям — этап 3 плана. У группы без раскладки
                          (курс без группы) колонка пуста для всех строк курса */}
                      {group.groupId !== null && <TableHead>{t("colLessons")}</TableHead>}
                      <TableHead className="text-right">{t("colAccrued")}</TableHead>
                      <TableHead className="text-right">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.months.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={group.groupId !== null ? 7 : 6} className="text-center text-sm text-muted-foreground">
                          {t("noMonths")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      group.months.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="whitespace-nowrap">
                            {row.month}
                            {row.locked && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {t("locked")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">{row.studentsCount}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">{money.format(row.base)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {row.percentUsed === null ? (
                              <span className="text-amber-600">{t("noRate")}</span>
                            ) : (
                              `${percentText(row.percentUsed)}%`
                            )}
                          </TableCell>
                          {group.groupId !== null && (
                            <TableCell className="min-w-[160px]">
                              {row.fallback ? (
                                <div className="flex items-start gap-1 text-xs text-amber-600">
                                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span>
                                    {t("lessonsNotMarked", {
                                      marked: row.sessionsMarked ?? 0,
                                      planned: row.lessonsScheduled ?? 0,
                                    })}
                                  </span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <span className="text-sm">
                                    {t("lessonsMarkedOf", { taught: row.lessonsTaught ?? 0, planned: row.lessonsPlanned ?? 0 })}
                                  </span>
                                  {row.sessions.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {row.sessions.map((session) => (
                                        <Badge
                                          key={session.date}
                                          variant={session.isMakeup ? "default" : "outline"}
                                          className="text-[10px] font-normal"
                                        >
                                          {formatDate(new Date(session.date))}
                                          {session.isMakeup ? ` · ${t("makeup")}` : ""}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="whitespace-nowrap text-right font-medium">
                            {money.format(row.amount)}
                            {!row.isFormula && (
                              <span className="ml-1 text-xs text-muted-foreground">{t("manual")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {row.locked && row.id && (
                                <ManualAmountButton
                                  accrualId={row.id}
                                  currentAmount={row.amount}
                                  onDone={() => router.refresh()}
                                />
                              )}
                              {row.locked && (
                                <RecalcButton
                                  teacherId={teacherId}
                                  month={row.month}
                                  groupId={group.groupId}
                                  courseId={group.courseId}
                                  onDone={() => router.refresh()}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("payoutsJournal")}</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPayouts")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tPayments("colPaidAt")}</TableHead>
                  <TableHead>{tPayments("colForMonth")}</TableHead>
                  <TableHead className="text-right">{t("colAmount")}</TableHead>
                  <TableHead>{tPayments("colMethod")}</TableHead>
                  <TableHead>{t("colComment")}</TableHead>
                  <TableHead>{t("recordedBy")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <Fragment key={payout.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap">{formatDate(payout.paidAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">{payout.forMonth ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money.format(payout.amount)}</TableCell>
                      <TableCell>{tPayments(`method.${payout.method}`)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{payout.comment ?? "—"}</TableCell>
                      <TableCell>{payout.createdBy}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t("deletePayout")}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("deletePayout")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("deletePayoutConfirm")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  const result = await deletePayout(payout.id);
                                  if (result.success) {
                                    toast({ title: t("payoutDeleted") });
                                    router.refresh();
                                  } else {
                                    toast({ title: tErrors("error"), description: tErrors("unexpected"), variant: "destructive" });
                                  }
                                }}
                              >
                                {tCommon("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Зафиксировать сумму месяца руками вместо формулы — или снять фиксацию. */
function ManualAmountButton({
  accrualId,
  currentAmount,
  onDone,
}: {
  accrualId: string;
  currentAmount: number;
  onDone: () => void;
}) {
  const t = useTranslations("salaries");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentAmount));
  const [isSaving, setIsSaving] = useState(false);

  const save = async (amount: number | null) => {
    setIsSaving(true);
    try {
      const result = await setManualSalaryAmount(accrualId, amount);
      if (result.success) {
        toast({ title: t("manualAmountSaved") });
        setOpen(false);
        onDone();
      } else {
        toast({ title: tErrors("error"), description: tErrors("unexpected"), variant: "destructive" });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setValue(String(currentAmount)); }}>
      <Button variant="ghost" size="icon" aria-label={t("fixAmount")} title={t("fixAmount")} onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fixAmount")}</DialogTitle>
          <DialogDescription>{t("fixAmountDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="manual-amount">{t("colAmount")} (UZS)</Label>
          <Input
            id="manual-amount"
            type="number"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => save(null)} disabled={isSaving}>
            {t("resetToFormula")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => {
                const amount = Number(value);
                if (Number.isInteger(amount) && amount >= 0) save(amount);
              }}
              disabled={isSaving}
            >
              {isSaving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Пересчёт закрытого месяца по актуальной базе — ставка остаётся зафиксированной. */
function RecalcButton({
  teacherId,
  month,
  groupId,
  courseId,
  onDone,
}: {
  teacherId: string;
  month: string;
  groupId: string | null;
  courseId: string;
  onDone: () => void;
}) {
  const t = useTranslations("salaries");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("recalc")} title={t("recalc")}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("recalcTitle", { month })}</AlertDialogTitle>
          <AlertDialogDescription>{t("recalcDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSaving}
            onClick={async (event) => {
              event.preventDefault();
              setIsSaving(true);
              try {
                const result = await recalculateSalaryMonth(teacherId, month, groupId, courseId);
                if (result.success) {
                  toast({ title: result.data.changed ? t("recalcDone") : t("recalcNoChange") });
                  onDone();
                } else {
                  toast({ title: tErrors("error"), description: tErrors("unexpected"), variant: "destructive" });
                }
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? tCommon("saving") : tCommon("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

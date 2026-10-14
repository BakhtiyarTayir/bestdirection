"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { createSalaryAdjustment, type SalaryAdjustmentKind } from "@/lib/api/salary";
import { Diff } from "lucide-react";

const REASON_MAX = 500;

interface CreateAdjustmentDialogProps {
  teacherId: string;
  /** Выбранный на странице месяц — корректировка по умолчанию идёт в него */
  defaultMonth: string;
}

/** Премия или штраф преподавателю за месяц. Причина обязательна. */
export function CreateAdjustmentDialog({ teacherId, defaultMonth }: CreateAdjustmentDialogProps) {
  const t = useTranslations("salaries");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SalaryAdjustmentKind>("BONUS");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(defaultMonth || format(new Date(), "yyyy-MM"));
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openDialog = (next: boolean) => {
    if (next) {
      setKind("BONUS");
      setAmount("");
      setReason("");
      setMonth(defaultMonth || format(new Date(), "yyyy-MM"));
    }
    setOpen(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountValue = Number(amount);
    const reasonValue = reason.trim();
    if (!Number.isInteger(amountValue) || amountValue <= 0 || !month || !reasonValue) return;

    setIsSaving(true);
    try {
      const result = await createSalaryAdjustment({
        teacherId,
        kind,
        amount: amountValue,
        month,
        reason: reasonValue,
      });
      if (result.success) {
        toast({ title: t("adjustmentCreated") });
        setOpen(false);
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: tErrors.has(result.error) ? tErrors(result.error as never) : t("adjustmentFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: tErrors("error"), description: tErrors("unexpected"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Diff className="mr-2 h-4 w-4" />
          {t("adjustment")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newAdjustment")}</DialogTitle>
          <DialogDescription>{t("newAdjustmentDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("colKind")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={kind === "BONUS" ? "default" : "outline"}
                aria-pressed={kind === "BONUS"}
                onClick={() => setKind("BONUS")}
              >
                {t("kindBonus")}
              </Button>
              <Button
                type="button"
                variant={kind === "PENALTY" ? "destructive" : "outline"}
                aria-pressed={kind === "PENALTY"}
                onClick={() => setKind("PENALTY")}
              >
                {t("kindPenalty")}
              </Button>
            </div>
          </div>

          {/* Одна колонка на телефоне, две — от sm */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjustment-amount">{t("colAmount")} (UZS)</Label>
              <Input
                id="adjustment-amount"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment-month">{t("colMonth")}</Label>
              <Input id="adjustment-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustment-reason">{t("colReason")}</Label>
            <Textarea
              id="adjustment-reason"
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSaving || !reason.trim() || !amount || !month}>
              {isSaving ? tCommon("saving") : t("saveAdjustment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

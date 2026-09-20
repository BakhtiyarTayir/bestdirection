"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { createPayout } from "@/lib/api/salary";
import { paymentMethods, type PaymentMethodValue } from "@/validators/payment";
import { Plus } from "lucide-react";

function currentMonth() {
  return format(new Date(), "yyyy-MM");
}

interface CreatePayoutDialogProps {
  teacherId: string;
  /** По умолчанию — сумма долга на выбранный месяц, чтобы не считать руками */
  defaultAmount?: number;
  defaultForMonth?: string;
}

/** Выплата преподавателю. Тот же диалог, что оплата ученика, но без выбора курса/группы. */
export function CreatePayoutDialog({ teacherId, defaultAmount, defaultForMonth }: CreatePayoutDialogProps) {
  const t = useTranslations("salaries");
  const tPayments = useTranslations("payments");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethodValue>("CASH");
  const [paidAt, setPaidAt] = useState<Date | undefined>(new Date());
  const [forMonth, setForMonth] = useState(defaultForMonth ?? currentMonth());
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openDialog = (next: boolean) => {
    if (next) {
      setAmount(defaultAmount ? String(defaultAmount) : "");
      setForMonth(defaultForMonth ?? currentMonth());
    }
    setOpen(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountValue = Number(amount);
    if (!paidAt || !Number.isInteger(amountValue) || amountValue <= 0) return;

    setIsSaving(true);
    try {
      const result = await createPayout({
        teacherId,
        amount: amountValue,
        method,
        paidAt: format(paidAt, "yyyy-MM-dd"),
        forMonth: forMonth || undefined,
        comment: comment.trim() || undefined,
      });
      if (result.success) {
        toast({ title: t("payoutCreated") });
        setOpen(false);
        router.refresh();
      } else {
        toast({ title: tErrors("error"), description: t("payoutFailed"), variant: "destructive" });
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("payout")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newPayout")}</DialogTitle>
          <DialogDescription>{t("newPayoutDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payout-amount">{t("colAmount")} (UZS)</Label>
              <Input
                id="payout-amount"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500000"
              />
            </div>
            <div className="space-y-2">
              <Label>{tPayments("colMethod")}</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethodValue)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tPayments(`method.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{tPayments("colPaidAt")}</Label>
              <DatePicker value={paidAt} onChange={setPaidAt} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-month">{tPayments("colForMonth")}</Label>
              <Input
                id="payout-month"
                type="month"
                value={forMonth}
                onChange={(e) => setForMonth(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payout-comment">{tPayments("commentOptional")}</Label>
            <Textarea
              id="payout-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={tPayments("commentPlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? tCommon("saving") : t("savePayout")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { createRefund } from "@/lib/api/billing";
import { refreshBadges } from "@/lib/badge-refresh";
import { paymentMethods, type PaymentMethodValue } from "@/validators/payment";

interface RefundButtonProps {
  studentId: string;
  courseId: string;
  courseTitle: string;
  groupId?: string;
  /** Аванс по курсу: и значение по умолчанию, и максимум суммы возврата */
  available: number;
}

/**
 * Возврат денег ученику. Кнопку рисуют только при положительном авансе:
 * api всё равно проверит сумму под блокировкой, а диалог лишь подсказывает предел.
 */
export function RefundButton({ studentId, courseId, courseTitle, groupId, available }: RefundButtonProps) {
  const t = useTranslations("studentBilling");
  const tPayments = useTranslations("payments");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(available));
  const [method, setMethod] = useState<PaymentMethodValue>("CASH");
  const [refundedAt, setRefundedAt] = useState<Date | undefined>(new Date());
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openDialog = () => {
    setAmount(String(available));
    setMethod("CASH");
    setRefundedAt(new Date());
    setComment("");
    setOpen(true);
  };

  const errorText = (error: string | undefined) => {
    switch (error) {
      case "refundExceedsAdvance":
        return t("refundExceedsAdvance");
      case "refundDateInFuture":
        return t("refundDateInFuture");
      case "refundDateBeforePayment":
        return t("refundDateBeforePayment");
      default:
        return t("refundFailed");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!refundedAt || !Number.isInteger(value) || value <= 0 || value > available) {
      toast({
        title: tErrors("error"),
        description: t("refundInvalidAmount", { max: money.format(available) }),
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    try {
      const result = await createRefund({
        studentId,
        courseId,
        groupId,
        amount: value,
        method,
        // Календарная дата строкой: Date уехал бы на сутки при UTC-сериализации
        refundedAt: format(refundedAt, "yyyy-MM-dd"),
        comment: comment.trim() || undefined,
      });
      if (result.success) {
        toast({ title: t("refundDone") });
        setOpen(false);
        refreshBadges();
        router.refresh();
      } else {
        toast({ title: tErrors("error"), description: errorText(result.error), variant: "destructive" });
      }
    } catch {
      toast({ title: tErrors("error"), description: tErrors("unexpected"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Undo2 className="mr-2 h-4 w-4" />
        {t("refund")}
      </Button>

      <Dialog open={open} onOpenChange={(value) => !isSaving && setOpen(value)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("refundTitle", { course: courseTitle })}</DialogTitle>
            <DialogDescription>{t("refundDescription")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm font-medium">{t("refundAvailable", { amount: money.format(available) })}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="refund-amount">{t("refundAmount")}</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min={1}
                  max={available}
                  step={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("refundMethod")}</Label>
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

            <div className="space-y-2">
              <Label>{t("refundDate")}</Label>
              <DatePicker value={refundedAt} onChange={setRefundedAt} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-comment">{t("refundComment")}</Label>
              <Textarea
                id="refund-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("refundCommentPlaceholder")}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
                {t("refundCancel")}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {t("refundSave")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

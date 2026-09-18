"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { previewMonthRecalc, recalculateMonth } from "@/lib/api/billing";
import { refreshBadges } from "@/lib/badge-refresh";

interface ChargeView {
  amount: number;
  basis: string;
  unitsTotal: number;
  unitsBilled: number;
}

interface Preview {
  month: string;
  priceUsed: number;
  current: ChargeView;
  next: ChargeView;
  changed: boolean;
}

/**
 * Явный пересчёт закрытого месяца. Закрытый месяц окончателен, и правки в
 * диалоге начислений на него не действуют — поэтому исправление идёт только
 * через эту кнопку, с предпросмотром «было → станет» перед подтверждением.
 */
export function RecalcMonthButton({
  enrollmentId,
  month,
}: {
  enrollmentId: string;
  month: string;
}) {
  const t = useTranslations("studentBilling");
  const tDebtors = useTranslations("debtors");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const basisText = (charge: ChargeView) => {
    switch (charge.basis) {
      case "full":
        return tDebtors("basisFull");
      case "lessons":
        return tDebtors("basisLessons", {
          billed: charge.unitsBilled,
          total: charge.unitsTotal,
        });
      case "days":
        return tDebtors("basisDays", {
          billed: charge.unitsBilled,
          total: charge.unitsTotal,
        });
      case "manual":
        return tDebtors("basisManual");
      default:
        return "—";
    }
  };

  const failed = () =>
    toast({ title: tErrors("error"), description: t("recalcFailed"), variant: "destructive" });

  const openDialog = async () => {
    setOpen(true);
    setPreview(null);
    setIsLoading(true);
    try {
      const result = await previewMonthRecalc(enrollmentId, month);
      if (result.success) {
        setPreview(result.data);
      } else {
        failed();
        setOpen(false);
      }
    } catch {
      failed();
      setOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const confirm = async () => {
    setIsSaving(true);
    try {
      const result = await recalculateMonth(enrollmentId, month);
      if (result.success) {
        toast({ title: t("recalcDone", { month }) });
        refreshBadges();
        setOpen(false);
        router.refresh();
      } else {
        failed();
      }
    } catch {
      failed();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={openDialog}
        title={t("recalc")}
        aria-label={t("recalc")}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={(value) => !isSaving && setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("recalcTitle", { month })}</DialogTitle>
            <DialogDescription>{t("recalcDescription")}</DialogDescription>
          </DialogHeader>

          {isLoading || !preview ? (
            <p className="py-4 text-sm text-muted-foreground">{tCommon("loading")}</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">{t("recalcCurrent")}</span>
                <span className="tabular-nums">
                  {money.format(preview.current.amount)} · {basisText(preview.current)}
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">{t("recalcNext")}</span>
                <span className="font-semibold tabular-nums">
                  {money.format(preview.next.amount)} · {basisText(preview.next)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("recalcPriceKept", { price: money.format(preview.priceUsed) })}
              </p>
              {!preview.changed && (
                <p className="text-xs font-medium text-emerald-600">{t("recalcNoChange")}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              {t("recalcCancel")}
            </Button>
            <Button
              onClick={confirm}
              disabled={isLoading || !preview || !preview.changed || isSaving}
            >
              {isSaving ? tCommon("saving") : t("recalcConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

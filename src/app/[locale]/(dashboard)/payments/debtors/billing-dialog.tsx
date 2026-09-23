"use client";

import { useEffect, useState } from "react";
import { intlLocale } from "@/i18n/config";
import { format } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  getEnrollmentBilling,
  updateEnrollmentBilling,
} from "@/lib/api/billing";
import { refreshBadges } from "@/lib/badge-refresh";

interface BillingDialogProps {
  enrollmentId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface BillingData {
  studentName: string;
  courseTitle: string;
  groupName: string | null;
  groupPrice: number | null;
  startsAt: string;
  startsAtExplicit: boolean;
  /** Дата, с которой реально идут начисления: может быть отложена группой */
  effectiveStartsAt: string;
  billingEndsAt: string | null;
  priceOverride: number | null;
  firstMonthCharge: number | null;
  firstMonth: string;
  suggestedFirstMonthCharge: number;
  suggestionBasis: string;
  suggestionUnitsTotal: number;
  suggestionUnitsBilled: number;
  hasSchedule: boolean;
}

export function BillingDialog({
  enrollmentId,
  open,
  onClose,
  onSaved,
}: BillingDialogProps) {
  const t = useTranslations("debtors");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const { toast } = useToast();

  const [data, setData] = useState<BillingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [startsAt, setStartsAt] = useState<Date | undefined>();
  const [endsAt, setEndsAt] = useState<Date | undefined>();
  const [priceOverride, setPriceOverride] = useState("");
  const [firstMonthCharge, setFirstMonthCharge] = useState("");

  const money = new Intl.NumberFormat(intlLocale(locale));

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getEnrollmentBilling(enrollmentId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          const billing = result.data;
          setData(billing);
          // startsAt показываем всегда, но в форму подставляем только если он
          // задан явно — иначе поле выглядело бы заполненным без ведома админа
          setStartsAt(billing.startsAtExplicit ? new Date(billing.startsAt) : undefined);
          setEndsAt(billing.billingEndsAt ? new Date(billing.billingEndsAt) : undefined);
          setPriceOverride(billing.priceOverride?.toString() ?? "");
          setFirstMonthCharge(billing.firstMonthCharge?.toString() ?? "");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enrollmentId]);

  const suggestionHint = () => {
    if (!data) return null;
    if (data.suggestionBasis === "lessons") {
      return t("suggestionLessons", {
        billed: data.suggestionUnitsBilled,
        total: data.suggestionUnitsTotal,
        amount: money.format(data.suggestedFirstMonthCharge),
      });
    }
    if (data.suggestionBasis === "days") {
      return t("suggestionDays", {
        billed: data.suggestionUnitsBilled,
        total: data.suggestionUnitsTotal,
        amount: money.format(data.suggestedFirstMonthCharge),
      });
    }
    if (data.suggestionBasis === "full") {
      return t("suggestionFull");
    }
    return null;
  };

  const handleSave = async () => {
    const priceValue = priceOverride.trim() === "" ? undefined : Number(priceOverride);
    const firstValue =
      firstMonthCharge.trim() === "" ? undefined : Number(firstMonthCharge);

    if (
      (priceValue !== undefined && (!Number.isInteger(priceValue) || priceValue <= 0)) ||
      (firstValue !== undefined && (!Number.isInteger(firstValue) || firstValue < 0))
    ) {
      toast({ title: tErrors("error"), description: t("invalidAmounts"), variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateEnrollmentBilling(enrollmentId, {
        startsAt: startsAt ? format(startsAt, "yyyy-MM-dd") : undefined,
        billingEndsAt: endsAt ? format(endsAt, "yyyy-MM-dd") : undefined,
        priceOverride: priceValue,
        firstMonthCharge: firstValue,
      });

      if (result.success) {
        toast({ title: t("billingSaved") });
        refreshBadges();
        onSaved();
      } else {
        toast({
          title: tErrors("error"),
          description:
            result.error === "endBeforeStart" ? t("endBeforeStart") : t("billingSaveFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("billingSettings")}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.studentName} · ${data.courseTitle}${data.groupName ? ` · ${data.groupName}` : ""}`
              : tCommon("loading")}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="py-6 text-sm text-muted-foreground">{tCommon("loading")}</p>
        ) : (
          <div className="space-y-4">
            {/* Закрытые месяцы заморожены: правки здесь действуют только на
                открытые, иначе админ ждал бы пересчёта, которого не будет */}
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t("closedMonthsNote")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("startsAt")}</Label>
                <DatePicker value={startsAt} onChange={setStartsAt} />
                <p className="text-xs text-muted-foreground">{t("startsAtHint")}</p>
                {/* Группа может начаться позже, чем заведена запись — тогда
                    считают с даты группы, и это стоит показать явно */}
                {data.effectiveStartsAt !== data.startsAt && (
                  <p className="text-xs font-medium text-amber-600">
                    {t("effectiveStartsAt", {
                      date: format(new Date(data.effectiveStartsAt), "dd.MM.yyyy"),
                    })}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("billingEndsAt")}</Label>
                <DatePicker value={endsAt} onChange={setEndsAt} />
                <p className="text-xs text-muted-foreground">{t("billingEndsAtHint")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price-override">{t("priceOverride")}</Label>
              <Input
                id="price-override"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder={
                  // Подсказка — цена, которая действует без индивидуальной:
                  // цена группы (цена курса в начислениях не участвует)
                  data.groupPrice !== null ? money.format(data.groupPrice) : ""
                }
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("priceOverrideHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="first-month">
                {t("firstMonthCharge", { month: data.firstMonth })}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="first-month"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder={money.format(data.suggestedFirstMonthCharge)}
                  value={firstMonthCharge}
                  onChange={(e) => setFirstMonthCharge(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setFirstMonthCharge(String(data.suggestedFirstMonthCharge))
                  }
                >
                  {t("useSuggestion")}
                </Button>
              </div>
              {suggestionHint() && (
                <p className="text-xs text-muted-foreground">{suggestionHint()}</p>
              )}
              <p className="text-xs text-muted-foreground">{t("firstMonthChargeHint")}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? tCommon("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

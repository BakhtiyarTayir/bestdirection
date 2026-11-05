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
import { recalculateSalaryMonth } from "@/lib/api/salary";

export interface RecalcGroup {
  groupId: string | null;
  courseId: string;
  label: string;
  lessonsPlanned: number | null;
  lessonsTaught: number | null;
  amount: number;
}

/**
 * Одна кнопка «пересчитать месяц» на всего учителя (а не по группам): админу
 * важен итог за месяц. Закрытый месяц заморожен, поэтому исправленный журнал
 * сам в сумму не попадает — только через явный пересчёт. Список групп нужен
 * в окне подтверждения, чтобы было видно, что именно поменяется.
 */
export function RecalcMonthButton({
  teacherId,
  month,
  groups,
}: {
  teacherId: string;
  month: string;
  groups: RecalcGroup[];
}) {
  const t = useTranslations("salaries");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const confirm = async () => {
    setIsSaving(true);
    // Каждая группа пересчитывается отдельной транзакцией и не зависит от
    // других: упавшая группа не мешает пересчитать остальные, в тосте
    // называем все, что не получились
    let before = 0;
    let after = 0;
    const failedLabels: string[] = [];
    try {
      for (const group of groups) {
        try {
          const result = await recalculateSalaryMonth(teacherId, month, group.groupId, group.courseId);
          if (result.success) {
            before += group.amount;
            after += result.data.amount;
            continue;
          }
        } catch {
          // ниже — как неуспех
        }
        failedLabels.push(group.label);
      }
    } finally {
      setIsSaving(false);
    }

    if (failedLabels.length > 0) {
      toast({
        title: tErrors("error"),
        description: t("recalcGroupFailed", { group: failedLabels.join(", ") }),
        variant: "destructive",
      });
    } else {
      toast({
        title:
          before === after
            ? t("recalcNoChange")
            : t("recalcChanged", { before: money.format(before), after: money.format(after) }),
      });
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RefreshCw className="mr-2 h-4 w-4" />
        {t("recalc")}
      </Button>

      <Dialog open={open} onOpenChange={(value) => !isSaving && setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("recalcTitle", { month })}</DialogTitle>
            <DialogDescription>{t("recalcDescription")}</DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto rounded-lg border text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t("recalcColGroup")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("recalcColLessons")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("recalcColAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={`${group.groupId ?? "none"}:${group.courseId}`} className="border-b last:border-0">
                    <td className="px-3 py-2">{group.label}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {group.lessonsPlanned ?? "—"} / {group.lessonsTaught ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {money.format(group.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              {t("recalcCancel")}
            </Button>
            <Button onClick={confirm} disabled={isSaving}>
              {isSaving ? tCommon("saving") : t("recalcConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";

/**
 * Период отчёта. Границы живут в строке запроса, а не в состоянии: ссылку на
 * «сентябрь по такому-то преподавателю» можно переслать, и страница остаётся
 * серверной.
 *
 * Даты ходят строкой "yyyy-MM-dd" из локального календаря — Date сериализуется
 * в момент времени и у пользователей UTC+5 уехал бы на сутки назад.
 */
export function PeriodFilter({ from, to }: { from?: string; to?: string }) {
  const t = useTranslations("attendance");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const parse = (value?: string) =>
    value ? new Date(`${value}T12:00:00.000Z`) : undefined;

  const apply = (next: { from?: string; to?: string }) => {
    const merged = { from, to, ...next };
    const params = new URLSearchParams();
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  const toValue = (date: Date | undefined) => (date ? format(date, "yyyy-MM-dd") : undefined);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label>{t("periodFrom")}</Label>
        <DatePicker
          value={parse(from)}
          onChange={(date) => apply({ from: toValue(date) })}
        />
      </div>
      <div className="space-y-1">
        <Label>{t("periodTo")}</Label>
        <DatePicker
          value={parse(to)}
          onChange={(date) => apply({ to: toValue(date) })}
        />
      </div>
      {(from || to) && (
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => apply({ from: undefined, to: undefined })}
        >
          {t("periodReset")}
        </Button>
      )}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Фильтр по месяцу для серверных списков — пара к BranchFilter/TeacherFilter:
 * значение живёт в URL (month), остальные параметры адреса сохраняются.
 * Пусто — сервис берёт текущий месяц сам, поэтому пустое значение убирает
 * параметр, а не шлёт его пустой строкой.
 */
export function MonthFilter({ month, namespace }: { month: string; namespace: string }) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const setMonth = (value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (!value) params.delete("month");
    else params.set("month", value);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  return (
    <div className="space-y-1">
      <Label htmlFor="attendance-month" className="text-xs text-muted-foreground">
        {t("filterMonth")}
      </Label>
      <Input
        id="attendance-month"
        type="month"
        className="w-40"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
    </div>
  );
}

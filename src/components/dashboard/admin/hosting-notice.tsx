"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Server, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { setHostingPaidUntil, type ApiHostingStatus } from "@/lib/api/dashboard";

/** В браузере: день (по Ташкенту), в который плашку закрыли крестиком */
const DISMISSED_KEY = "hostingNoticeDismissedOn";

/**
 * Срок оплаты хостинга. Плашку за 10 дней до срока видят все администраторы;
 * поле с датой — только владелец сервера (canEdit считает api). Закрытая
 * крестиком плашка прячется до конца дня — today приходит из api.
 */
export function HostingNotice({ hosting, today }: { hosting: ApiHostingStatus; today: string }) {
  const t = useTranslations("dashboardAdmin");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [paidUntil, setPaidUntil] = useState(hosting.paidUntil ?? "");
  const [pending, startTransition] = useTransition();
  // На сервере и при гидратации плашку не показываем (снимок «закрыта»):
  // иначе закрытая сегодня мелькала бы при каждой загрузке страницы
  const dismissedOn = useSyncExternalStore(subscribeDismissed, readDismissed, () => today);
  const dismissed = dismissedOn === today;

  const dismiss = () => {
    memoryDismissedOn = today;
    try {
      localStorage.setItem(DISMISSED_KEY, today);
    } catch {
      // Хранилище недоступно (приватный режим) — плашка вернётся после перезагрузки
    }
    dismissedListeners.forEach((listener) => listener());
  };

  const banner =
    hosting.warn && hosting.daysLeft !== null && !dismissed ? (
      <div
        role="alert"
        className={cn(
          "relative flex items-center gap-3 rounded-lg border p-4 pr-12 text-sm font-medium",
          hosting.daysLeft < 0
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        )}
      >
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span>
          {hosting.daysLeft < 0
            ? t("hostingExpired", { date: formatDate(hosting.paidUntil!) })
            : hosting.daysLeft === 0
              ? t("hostingToday")
              : t("hostingDaysLeft", { days: hosting.daysLeft, date: formatDate(hosting.paidUntil!) })}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("hostingDismiss")}
          title={t("hostingDismiss")}
          className="absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ) : null;

  if (!hosting.canEdit) return banner;

  const save = () => {
    startTransition(async () => {
      const result = await setHostingPaidUntil(paidUntil);
      if (!result.success) {
        toast({ title: tErrors("error"), description: tErrors(result.error), variant: "destructive" });
        return;
      }
      toast({ title: t("hostingSaved") });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {banner}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        <Server className="h-4 w-4 text-muted-foreground" />
        <label htmlFor="hosting-paid-until" className="text-muted-foreground">
          {t("hostingPaidUntil")}
        </label>
        <Input
          id="hosting-paid-until"
          type="date"
          value={paidUntil}
          onChange={(event) => setPaidUntil(event.target.value)}
          className="h-9 w-auto"
        />
        <Button
          size="sm"
          onClick={save}
          disabled={pending || !paidUntil || paidUntil === hosting.paidUntil}
        >
          {t("hostingSave")}
        </Button>
      </div>
    </div>
  );
}

const dismissedListeners = new Set<() => void>();
/** Запасной вариант, если localStorage недоступен: держится до перезагрузки */
let memoryDismissedOn: string | null = null;

function subscribeDismissed(listener: () => void) {
  dismissedListeners.add(listener);
  return () => dismissedListeners.delete(listener);
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? memoryDismissedOn;
  } catch {
    return memoryDismissedOn;
  }
}

/** "2026-11-06" → "06.11.2026" */
function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
}

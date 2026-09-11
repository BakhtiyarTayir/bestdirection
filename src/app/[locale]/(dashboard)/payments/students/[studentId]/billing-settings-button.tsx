"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import { BillingDialog } from "../../debtors/billing-dialog";

/**
 * Тот же диалог, что на строке должника. Здесь он нужен затем, что из списка
 * должников студент исчезает, как только долг закрыт, — и поправить дату
 * начала или цену после этого было негде.
 */
export function BillingSettingsButton({ enrollmentId }: { enrollmentId: string }) {
  const t = useTranslations("debtors");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="mr-2 h-4 w-4" />
        {t("billingSettings")}
      </Button>

      {open && (
        <BillingDialog
          enrollmentId={enrollmentId}
          open
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

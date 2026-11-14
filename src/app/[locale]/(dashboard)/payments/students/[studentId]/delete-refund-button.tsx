"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { deleteRefund } from "@/lib/api/billing";
import { refreshBadges } from "@/lib/badge-refresh";

/** Удаление ошибочного возврата: аванс ученика восстанавливается. */
export function DeleteRefundButton({ refundId, amount }: { refundId: string; amount: number }) {
  const t = useTranslations("studentBilling");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteRefund(refundId);
      if (result.success) {
        toast({ title: t("refundDeleted") });
        refreshBadges();
        router.refresh();
      } else {
        toast({ title: tErrors("error"), description: t("refundDeleteFailed"), variant: "destructive" });
      }
    } catch {
      toast({ title: tErrors("error"), description: tErrors("unexpected"), variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isDeleting} aria-label={t("refundDelete")}>
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 text-destructive" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("refundDelete")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("refundDeleteConfirm", { amount: new Intl.NumberFormat(intlLocale(locale)).format(amount) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("refundDeleteCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>{t("refundDeleteAction")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

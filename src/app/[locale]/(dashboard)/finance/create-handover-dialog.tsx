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
import { createHandover } from "@/lib/api/finance";
import { Plus } from "lucide-react";

interface CreateHandoverDialogProps {
  branches: { id: string; name: string }[];
  /** Филиал, выбранный на странице, — предвыбран в форме */
  branchId?: string;
  /** Месяц страницы — по умолчанию в поле «Месяц» */
  month: string;
  /** Осталось на руках по месяцам — подставляется в сумму выбранного месяца */
  onHandByMonth: Record<string, number>;
}

/** Сдача прибыли владельцу. Тот же диалог, что выплата преподавателю, но с выбором филиала. */
export function CreateHandoverDialog({ branches, branchId, month, onHandByMonth }: CreateHandoverDialogProps) {
  const t = useTranslations("finance");
  const tPayments = useTranslations("payments");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState(branchId ?? "");
  const [forMonth, setForMonth] = useState(month);
  const [amount, setAmount] = useState("");
  const [handedAt, setHandedAt] = useState<Date | undefined>(new Date());
  const [receivedBy, setReceivedBy] = useState("");
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Остаток на руках известен только в разрезе выбранного на странице
  // филиала (или всех сразу): для другого филиала суммой не подсказываем
  const suggestAmount = (selectedBranch: string, selectedMonth: string) => {
    const onHand = onHandByMonth[selectedMonth];
    const known = selectedBranch !== "" && selectedBranch === (branchId ?? "");
    return known && onHand !== undefined && onHand > 0 ? String(onHand) : "";
  };

  const openDialog = (next: boolean) => {
    if (next) {
      setBranch(branchId ?? "");
      setForMonth(month);
      setAmount(suggestAmount(branchId ?? "", month));
      setHandedAt(new Date());
      setReceivedBy("");
      setComment("");
    }
    setOpen(next);
  };

  const changeBranch = (value: string) => {
    setBranch(value);
    setAmount(suggestAmount(value, forMonth));
  };

  const changeMonth = (value: string) => {
    setForMonth(value);
    setAmount(suggestAmount(branch, value));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountValue = Number(amount);
    if (!branch || !forMonth || !handedAt || !Number.isInteger(amountValue) || amountValue <= 0) return;

    setIsSaving(true);
    try {
      const result = await createHandover({
        branchId: branch,
        amount: amountValue,
        handedAt: format(handedAt, "yyyy-MM-dd"),
        forMonth,
        receivedBy: receivedBy.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      if (result.success) {
        toast({ title: t("handoverCreated") });
        setOpen(false);
        router.refresh();
      } else {
        toast({ title: tErrors("error"), description: t("handoverFailed"), variant: "destructive" });
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
          {t("handoverAdd")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("handoverNewTitle")}</DialogTitle>
          <DialogDescription>{t("handoverDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("colBranch")}</Label>
            <Select value={branch} onValueChange={changeBranch}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectBranch")} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="handover-month">{t("colForMonth")}</Label>
              <Input
                id="handover-month"
                type="month"
                value={forMonth}
                onChange={(e) => changeMonth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("colDate")}</Label>
              <DatePicker value={handedAt} onChange={setHandedAt} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="handover-amount">{t("colAmount")} (UZS)</Label>
              <Input
                id="handover-amount"
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
              <Label htmlFor="handover-received-by">{t("colReceivedBy")}</Label>
              <Input
                id="handover-received-by"
                maxLength={200}
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="handover-comment">{tPayments("commentOptional")}</Label>
            <Textarea id="handover-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSaving || !branch}>
              {isSaving ? tCommon("saving") : t("handoverSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

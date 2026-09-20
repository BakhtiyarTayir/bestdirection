"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { createBranch, updateBranch, type ApiBranch } from "@/lib/api/branches";
import { Plus, Loader2 } from "lucide-react";

interface BranchFormDialogProps {
  branch?: ApiBranch;
  /** Кнопка-триггер рисуется только у диалога создания; правка открывается извне. */
  trigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function BranchFormDialog({ branch, trigger = true, open: controlledOpen, onOpenChange }: BranchFormDialogProps) {
  const t = useTranslations("branches");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!branch;

  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [isPending, setIsPending] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  // Диалог создания переиспользуется между открытиями (одна кнопка на
  // странице) — при каждом открытии подставляем актуальные значения заново,
  // а не только при монтировании. Диалог правки, наоборот, монтируется
  // родителем заново на каждый клик по своей строке (BranchList: `{editing &&
  // <BranchFormDialog key .../>}`), поэтому для него initial state уже верен.
  const setOpen = (next: boolean) => {
    if (next && !isControlled) {
      setName(branch?.name ?? "");
      setAddress(branch?.address ?? "");
      setPhone(branch?.phone ?? "");
    }
    if (isControlled) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsPending(true);
    const result = isEdit
      ? await updateBranch(branch.id, { name, address, phone })
      : await createBranch({ name, address, phone });
    setIsPending(false);

    if (!result.success) {
      const message = tErrors.has(result.error) ? tErrors(result.error) : result.error;
      toast({ title: tErrors("error"), description: message, variant: "destructive" });
      return;
    }

    toast({ title: isEdit ? t("branchUpdated") : t("branchCreated") });
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("createBranch")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editBranch") : t("createBranch")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="branch-name">{t("branchName")}</Label>
            <Input id="branch-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-address">{t("branchAddress")}</Label>
            <Input id="branch-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-phone">{t("branchPhone")}</Label>
            <Input id="branch-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

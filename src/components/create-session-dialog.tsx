"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { createAttendanceSession } from "@/actions/attendance-actions";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface CreateSessionDialogProps {
  courseId: string;
  onSuccess?: () => void;
}

export function CreateSessionDialog({
  courseId,
  onSuccess,
}: CreateSessionDialogProps) {
  const t = useTranslations("attendance");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>();
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!date) {
      toast({
        title: tErrors("error"),
        description: t("selectDateError"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await createAttendanceSession({
        courseId,
        date,
        note: note.trim() || undefined,
      });

      if (result.success) {
        toast({
          title: t("sessionCreated"),
          description: t("sessionCreatedSuccess"),
        });
        setDate(undefined);
        setNote("");
        setOpen(false);
        router.refresh();
        onSuccess?.();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error ?? t("sessionCreateFailed"),
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
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("createSession")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newSession")}</DialogTitle>
          <DialogDescription>
            {t("newSessionDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("sessionDate")}</Label>
            <DatePicker
              value={date}
              onChange={setDate}
              placeholder={t("selectDate")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-note">{t("noteOptional")}</Label>
            <textarea
              id="session-note"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={t("notePlaceholderExample")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? tCommon("creating") : tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { createAttendanceSession } from "@/lib/api/attendance";
import { getCourseGroups } from "@/lib/api/groups";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface Group {
  id: string;
  name: string;
}

// Сентинел «Все группы» — value у Radix Select не бывает пустой строкой,
// поэтому пустая строка отдана состоянию «выбор ещё не сделан» (плейсхолдер)
const ALL_GROUPS = "all";

interface CreateSessionDialogProps {
  courseId: string;
  courseSlug: string;
  /**
   * Группа зафиксирована — журнал одной группы (план «Журнал посещаемости
   * по группам», п.2): выбор скрыт, список групп курса даже не грузится.
   */
  fixedGroup?: { id: string; name: string };
  /**
   * Группу нужно выбрать явно — вкладка курса по группам (план, п.4):
   * «без группы» здесь не предлагаем, по умолчанию — группа открытой вкладки.
   */
  defaultGroupId?: string;
  onSuccess?: () => void;
}

export function CreateSessionDialog({
  courseId,
  courseSlug,
  fixedGroup,
  defaultGroupId,
  onSuccess,
}: CreateSessionDialogProps) {
  const t = useTranslations("attendance");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const requireGroup = fixedGroup !== undefined || defaultGroupId !== undefined;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>();
  const [note, setNote] = useState("");
  const [groupId, setGroupId] = useState<string>(fixedGroup?.id ?? defaultGroupId ?? ALL_GROUPS);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    // Группа зафиксирована — выбирать не из чего, список групп курса тут не нужен
    if (open && !fixedGroup) {
      setIsLoadingGroups(true);
      getCourseGroups(courseId)
        .then((result) => {
          if (result.success) {
            setGroups(result.data);
          }
        })
        .finally(() => setIsLoadingGroups(false));
    }
  }, [open, courseId, fixedGroup]);

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
    if (requireGroup && (!groupId || groupId === ALL_GROUPS)) {
      toast({
        title: tErrors("error"),
        description: t("selectGroupError"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await createAttendanceSession({
        courseId,
        // Send the calendar date as a plain string: a Date object serializes
        // to a UTC instant and @db.Date truncates it to the previous day
        // for timezones ahead of UTC.
        date: format(date, "yyyy-MM-dd"),
        note: note.trim() || undefined,
        groupId: groupId && groupId !== ALL_GROUPS ? groupId : undefined,
      });

      if (result.success) {
        toast({
          title: t("sessionCreated"),
          description: t("sessionCreatedSuccess"),
        });
        setDate(undefined);
        setNote("");
        setGroupId(fixedGroup?.id ?? defaultGroupId ?? ALL_GROUPS);
        setOpen(false);
        onSuccess?.();
        router.push(`/courses/${courseSlug}/attendance/${result.data.id}`);
      } else {
        toast({
          title: tErrors("error"),
          // Ключ ошибки от api переводится общим словарём, запасной текст — свой
          description: result.error ? tErrors(result.error) : t("sessionCreateFailed"),
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
          {fixedGroup ? (
            <div className="space-y-2">
              <Label>{t("group")}</Label>
              <p className="text-sm">{fixedGroup.name}</p>
            </div>
          ) : (
            groups.length > 0 && (
              <div className="space-y-2">
                <Label>{requireGroup ? t("group") : t("groupOptional")}</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("allGroups")} />
                  </SelectTrigger>
                  <SelectContent>
                    {!requireGroup && <SelectItem value={ALL_GROUPS}>{t("allGroups")}</SelectItem>}
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}
          {isLoadingGroups && (
            <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
          )}
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

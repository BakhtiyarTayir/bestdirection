"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "@/i18n/navigation";
import { addStudentsToGroup } from "@/lib/api/groups";

interface EnrollmentGroupSelectProps {
  studentId: string;
  currentGroupId: string | null;
  groups: { id: string; name: string; branchName: string | null }[];
}

/**
 * Группа ученика на курсе прямо из карточки редактирования. Тот же вызов,
 * что «Добавить в группу» на странице группы: он сам переводит из прежней
 * группы и замораживает закрытые месяцы, поэтому деньги считаются так же.
 */
export function EnrollmentGroupSelect({ studentId, currentGroupId, groups }: EnrollmentGroupSelectProps) {
  const t = useTranslations("users");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [groupId, setGroupId] = useState(currentGroupId ?? "");
  const [isPending, startTransition] = useTransition();

  if (groups.length === 0) {
    return <span className="text-muted-foreground">{t("enrollmentNoGroups")}</span>;
  }

  const save = () => {
    startTransition(async () => {
      const result = await addStudentsToGroup(groupId, [studentId]);
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: t("enrollmentGroupSaved") });
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={groupId} onValueChange={setGroupId} disabled={isPending}>
        <SelectTrigger className="h-8 w-56">
          <SelectValue placeholder={t("enrollmentGroupPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.branchName ? `${group.name} · ${group.branchName}` : group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {groupId && groupId !== currentGroupId && (
        <Button size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {t("enrollmentGroupSave")}
        </Button>
      )}
    </div>
  );
}

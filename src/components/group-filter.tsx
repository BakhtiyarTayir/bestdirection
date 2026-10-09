"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

interface GroupFilterProps {
  groupId?: string;
  groups: { id: string; name: string; course: { title: string } }[];
  /** Namespace экрана с ключами filterGroup/allGroups — см. BranchFilter */
  namespace: string;
}

/**
 * Фильтр по группе для серверных списков — пара к BranchFilter: значение живёт
 * в URL (groupId), остальные параметры адреса сохраняются. Список групп страница
 * уже сузила по курсу и филиалу; подпись «Курс — Группа» нужна, когда курс не выбран.
 */
export function GroupFilter({ groupId, groups, namespace }: GroupFilterProps) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const setGroup = (value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === ALL) params.delete("groupId");
    else params.set("groupId", value);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  if (groups.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{t("filterGroup")}</Label>
      <Select value={groupId ?? ALL} onValueChange={setGroup}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={t("allGroups")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allGroups")}</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.course.title} — {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

interface BranchFilterProps {
  branchId?: string;
  branches: { id: string; name: string }[];
  /**
   * Namespace экрана — каждый уже содержит свои filterBranch/allBranches
   * (клиентский компонент не может получить функцию t() серверного родителя,
   * next-intl передаёт только сериализуемые пропсы).
   */
  namespace: string;
}

/**
 * Общий фильтр по филиалу для списков (/groups, /users, /students, /payments,
 * /payments/debtors). Живёт в URL — страница серверная, ссылка на
 * отфильтрованный список шарится, как и другие фильтры в проекте.
 */
export function BranchFilter({ branchId, branches, namespace }: BranchFilterProps) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const setBranch = (value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === ALL) params.delete("branchId");
    else params.set("branchId", value);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  if (branches.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{t("filterBranch")}</Label>
      <Select value={branchId ?? ALL} onValueChange={setBranch}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={t("allBranches")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allBranches")}</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

interface TeacherFilterProps {
  teacherId?: string;
  teachers: { id: string; firstName: string; lastName: string }[];
  /** Namespace экрана с ключами filterTeacher/allTeachers — см. BranchFilter */
  namespace: string;
}

/**
 * Фильтр по преподавателю для серверных списков — пара к BranchFilter:
 * значение живёт в URL (teacherId), остальные параметры адреса сохраняются.
 */
export function TeacherFilter({ teacherId, teachers, namespace }: TeacherFilterProps) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const setTeacher = (value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === ALL) params.delete("teacherId");
    else params.set("teacherId", value);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  if (teachers.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{t("filterTeacher")}</Label>
      <Select value={teacherId ?? ALL} onValueChange={setTeacher}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={t("allTeachers")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allTeachers")}</SelectItem>
          {teachers.map((teacher) => (
            <SelectItem key={teacher.id} value={teacher.id}>
              {teacher.lastName} {teacher.firstName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

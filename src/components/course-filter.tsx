"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

interface CourseFilterProps {
  courseId?: string;
  courses: { id: string; title: string }[];
  /** Namespace экрана с ключами filterCourse/allCourses — см. BranchFilter */
  namespace: string;
}

/**
 * Фильтр по курсу для серверных списков — пара к BranchFilter:
 * значение живёт в URL (courseId), остальные параметры адреса сохраняются.
 */
export function CourseFilter({ courseId, courses, namespace }: CourseFilterProps) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const setCourse = (value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === ALL) params.delete("courseId");
    else params.set("courseId", value);
    // Группа выбрана из списка прежнего курса — после смены курса она не подходит
    params.delete("groupId");
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  if (courses.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{t("filterCourse")}</Label>
      <Select value={courseId ?? ALL} onValueChange={setCourse}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={t("allCourses")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allCourses")}</SelectItem>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              {course.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

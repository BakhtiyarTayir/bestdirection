"use client";

import { Progress } from "@/components/ui/progress";
import { useTranslations } from "next-intl";

interface CourseProgressProps {
  total: number;
  completed: number;
  percentage: number;
}

export function CourseProgress({ total, completed, percentage }: CourseProgressProps) {
  const t = useTranslations("lessons");

  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t("completed", { completed, total })}
        </span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

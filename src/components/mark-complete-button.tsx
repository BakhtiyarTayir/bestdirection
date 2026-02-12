"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { markLessonComplete } from "@/actions/progress-actions";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

interface MarkCompleteButtonProps {
  lessonId: string;
  isCompleted: boolean;
}

export function MarkCompleteButton({ lessonId, isCompleted }: MarkCompleteButtonProps) {
  const t = useTranslations("lessons");
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(isCompleted);
  const router = useRouter();

  if (completed) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle2 className="h-5 w-5" />
        {t("lessonCompleted")}
      </div>
    );
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await markLessonComplete(lessonId);
      if (result.success) {
        setCompleted(true);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={loading} variant="outline">
      <CheckCircle2 className="h-4 w-4 mr-2" />
      {loading ? tCommon("saving") : t("markAsComplete")}
    </Button>
  );
}

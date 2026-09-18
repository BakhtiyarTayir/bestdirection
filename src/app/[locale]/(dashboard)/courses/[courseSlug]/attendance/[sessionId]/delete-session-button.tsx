"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { deleteAttendanceSession } from "@/lib/api/attendance";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface DeleteSessionButtonProps {
  sessionId: string;
  courseSlug: string;
}

export function DeleteSessionButton({
  sessionId,
  courseSlug,
}: DeleteSessionButtonProps) {
  const t = useTranslations("attendance");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      t("deleteSessionConfirm")
    );
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const result = await deleteAttendanceSession(sessionId);
      if (result.success) {
        toast({
          title: t("sessionDeleted"),
        });
        router.push(`/courses/${courseSlug}/attendance`);
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error ?? t("deleteSessionFailed"),
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
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={isLoading}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {isLoading ? tCommon("deleting") : t("deleteSession")}
    </Button>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { deleteAttendanceSession } from "@/actions/attendance-actions";
import { Trash2 } from "lucide-react";

interface DeleteSessionButtonProps {
  sessionId: string;
  courseId: string;
}

export function DeleteSessionButton({
  sessionId,
  courseId,
}: DeleteSessionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Вы уверены, что хотите удалить эту сессию? Все записи о посещаемости будут удалены."
    );
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const result = await deleteAttendanceSession(sessionId);
      if (result.success) {
        toast({
          title: "Сессия удалена",
          description: "Сессия посещаемости успешно удалена.",
        });
        router.push(`/courses/${courseId}/attendance`);
        router.refresh();
      } else {
        toast({
          title: "Ошибка",
          description: result.error ?? "Не удалось удалить сессию.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Ошибка",
        description: "Произошла непредвиденная ошибка.",
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
      {isLoading ? "Удаление..." : "Удалить сессию"}
    </Button>
  );
}

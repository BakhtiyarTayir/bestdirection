"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { deleteHomework, toggleHomeworkPublished } from "@/actions/homework-actions";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import {
  Code2,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  FileText,
  Users,
  Loader2,
} from "lucide-react";

interface HomeworkItem {
  id: string;
  title: string;
  language: string | null;
  isPublished: boolean;
  maxAttempts: number;
  passingScore: number;
  _count: { testCases: number; submissions: number };
}

interface HomeworkManagementProps {
  courseId: string;
  lessonId: string;
  homeworks: HomeworkItem[];
}

export function HomeworkManagement({
  courseId,
  lessonId,
  homeworks,
}: HomeworkManagementProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleTogglePublished = (homeworkId: string) => {
    startTransition(async () => {
      const result = await toggleHomeworkPublished(homeworkId);
      if (result.success) {
        toast({ title: "Успешно", description: "Статус публикации обновлён" });
        router.refresh();
      } else {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      }
    });
  };

  const handleDelete = (homeworkId: string) => {
    if (!confirm("Удалить задание? Все решения студентов будут потеряны.")) return;
    startTransition(async () => {
      const result = await deleteHomework(homeworkId);
      if (result.success) {
        toast({ title: "Успешно", description: "Задание удалено" });
        router.refresh();
      } else {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      }
    });
  };

  if (homeworks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            Домашние задания
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Для этого урока ещё не создано домашних заданий с автопроверкой.
          </p>
          <Link href={`/courses/${courseId}/lessons/${lessonId}/homework/new`}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать задание
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Code2 className="h-5 w-5" />
          Домашние задания ({homeworks.length})
        </h3>
        <Link href={`/courses/${courseId}/lessons/${lessonId}/homework/new`}>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Добавить
          </Button>
        </Link>
      </div>

      {homeworks.map((hw) => (
        <Card key={hw.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{hw.title}</span>
                  <Badge variant={hw.isPublished ? "default" : "secondary"}>
                    {hw.isPublished ? "Опубликовано" : "Черновик"}
                  </Badge>
                  {hw.language && (
                    <Badge variant="outline" className="text-xs">
                      {LANGUAGE_LABELS[hw.language] || hw.language}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {hw._count.testCases} тестов
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {hw._count.submissions} решений
                  </span>
                  <span>Проходной: {hw.passingScore}%</span>
                  <span>Попытки: {hw.maxAttempts}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTogglePublished(hw.id)}
                  disabled={isPending}
                  title={hw.isPublished ? "Скрыть" : "Опубликовать"}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : hw.isPublished ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Link href={`/courses/${courseId}/lessons/${lessonId}/homework/${hw.id}/edit`}>
                  <Button variant="ghost" size="sm">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href={`/courses/${courseId}/lessons/${lessonId}/homework/${hw.id}`}>
                  <Button variant="ghost" size="sm">
                    <Users className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(hw.id)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { deleteHomework } from "@/lib/api/homework";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { useTranslations } from "next-intl";
import { ExportButton, ImportButton } from "@/components/export-import-buttons";
import {
  Code2,
  Plus,
  Pencil,
  Trash2,
  FileText,
  Users,
} from "lucide-react";

interface HomeworkItem {
  id: string;
  slug: string;
  title: string;
  language: string | null;
  isPublished: boolean;
  maxAttempts: number;
  passingScore: number;
  _count?: { testCases: number; submissions: number };
}

interface HomeworkManagementProps {
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
  homeworks: HomeworkItem[];
}

export function HomeworkManagement({
  lessonId,
  courseSlug,
  lessonSlug,
  homeworks,
}: HomeworkManagementProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("homework");
  const tCommon = useTranslations("common");
  const tSuccess = useTranslations("success");
  const tErrors = useTranslations("errors");

  const handleDelete = (homeworkId: string) => {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteHomework(homeworkId);
      if (result.success) {
        toast({ title: tSuccess("success"), description: t("homeworkDeleted") });
        router.refresh();
      } else {
        toast({ title: tErrors("generic"), description: result.error, variant: "destructive" });
      }
    });
  };

  if (homeworks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            {t("noHomework")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ImportButton type="homework" targetId={lessonId} />
            <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/new`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t("createHomework")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Code2 className="h-5 w-5" />
          {t("title")} ({homeworks.length})
        </h3>
        <div className="flex items-center gap-2">
          <ImportButton type="homework" targetId={lessonId} />
          <ExportButton type="homework" id={lessonId} />
          <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {tCommon("add")}
            </Button>
          </Link>
        </div>
      </div>

      {homeworks.map((hw) => (
        <Card key={hw.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{hw.title}</span>
                  <Badge variant={hw.isPublished ? "default" : "secondary"}>
                    {hw.isPublished ? t("published") : tCommon("draft")}
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
                    {t("testCasesCount", { count: hw._count?.testCases ?? 0 })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {t("submissionsCount", { count: hw._count?.submissions ?? 0 })}
                  </span>
                  <span>{t("passingScoreInfo", { score: hw.passingScore })}</span>
                  <span>{t("attemptsInfo", { count: hw.maxAttempts })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/${hw.slug}/edit`}>
                  <Button variant="ghost" size="sm">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/${hw.slug}`}>
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

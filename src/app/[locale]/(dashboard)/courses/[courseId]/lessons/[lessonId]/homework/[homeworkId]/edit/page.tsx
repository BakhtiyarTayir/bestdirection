import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHomeworkForTeacher } from "@/actions/homework-actions";
import { HomeworkForm } from "@/components/homework/homework-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

interface EditHomeworkPageProps {
  params: Promise<{ courseId: string; lessonId: string; homeworkId: string }>;
}

export default async function EditHomeworkPage({ params }: EditHomeworkPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseId, lessonId, homeworkId } = await params;
  const result = await getHomeworkForTeacher(homeworkId);

  if (!result.success || !result.data) {
    return <HomeworkNotFound error={result.error} />;
  }

  const homework = result.data;

  return (
    <EditHomeworkPageContent
      courseId={courseId}
      lessonId={lessonId}
      homework={homework}
    />
  );
}

function HomeworkNotFound({ error }: { error?: string }) {
  const tErrors = useTranslations("errors");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tErrors("homeworkNotFound")}</h1>
      <p className="text-destructive">{error}</p>
    </div>
  );
}

function EditHomeworkPageContent({
  courseId,
  lessonId,
  homework,
}: {
  courseId: string;
  lessonId: string;
  homework: any;
}) {
  const t = useTranslations("homework");
  const tCommon = useTranslations("common");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/courses/${courseId}/lessons/${lessonId}/edit`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {tCommon("back")}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t("editHomework")}</h1>
      </div>

      <HomeworkForm
        courseId={courseId}
        lessonId={lessonId}
        homework={JSON.parse(JSON.stringify(homework))}
      />
    </div>
  );
}

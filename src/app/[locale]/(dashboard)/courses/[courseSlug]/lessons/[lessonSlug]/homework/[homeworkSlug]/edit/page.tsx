import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHomeworkForTeacher } from "@/lib/api/homework.server";
import { HomeworkForm } from "@/components/homework/homework-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { resolveFullPath } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface EditHomeworkPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string; homeworkSlug: string }>;
}

type GetHomeworkForTeacherResult = Awaited<ReturnType<typeof getHomeworkForTeacher>>;
type TeacherHomework = Extract<GetHomeworkForTeacherResult, { success: true }>["data"];

export default async function EditHomeworkPage({ params }: EditHomeworkPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseSlug, lessonSlug, homeworkSlug } = await params;
  const { lessonId, homeworkId } = await resolveFullPath({ courseSlug, lessonSlug, homeworkSlug });
  const result = await getHomeworkForTeacher(homeworkId!);

  if (!result.success) {
    return <HomeworkNotFound error={result.error} />;
  }

  const homework = result.data;

  return (
    <EditHomeworkPageContent
      courseSlug={courseSlug}
      lessonSlug={lessonSlug}
      lessonId={lessonId!}
      homework={homework}
    />
  );
}

async function HomeworkNotFound({ error }: { error?: string }) {
  const tErrors = await getTranslations("errors");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tErrors("homeworkNotFound")}</h1>
      <p className="text-destructive">{error}</p>
    </div>
  );
}

async function EditHomeworkPageContent({
  courseSlug,
  lessonSlug,
  lessonId,
  homework,
}: {
  courseSlug: string;
  lessonSlug: string;
  lessonId: string;
  homework: TeacherHomework;
}) {
  const t = await getTranslations("homework");
  const tCommon = await getTranslations("common");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/edit`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {tCommon("back")}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t("editHomework")}</h1>
      </div>

      <HomeworkForm
        courseSlug={courseSlug}
        lessonSlug={lessonSlug}
        lessonId={lessonId}
        homework={JSON.parse(JSON.stringify(homework))}
      />
    </div>
  );
}

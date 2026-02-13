import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHomeworkForStudent, getHomeworkForTeacher, getSubmissions } from "@/actions/homework-actions";
import { HomeworkView } from "@/components/homework/homework-view";
import { HomeworkSubmissions } from "@/components/homework/homework-submissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Code2, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { resolveFullPath } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface HomeworkPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string; homeworkSlug: string }>;
}

export default async function HomeworkPage({ params }: HomeworkPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { courseSlug, lessonSlug, homeworkSlug } = await params;
  const { courseId, lessonId, homeworkId } = await resolveFullPath({ courseSlug, lessonSlug, homeworkSlug });
  const isTeacherOrAdmin = session.user.role === "ADMIN" || session.user.role === "TEACHER";

  if (isTeacherOrAdmin) {
    const [hwResult, subResult] = await Promise.all([
      getHomeworkForTeacher(homeworkId!),
      getSubmissions(homeworkId!),
    ]);

    if (!hwResult.success || !hwResult.data) {
      return (
        <HomeworkNotFound error={hwResult.error} />
      );
    }

    const homework = hwResult.data;
    const submissions = subResult.success ? subResult.data! : [];

    return (
      <TeacherView
        courseSlug={courseSlug}
        lessonSlug={lessonSlug}
        homeworkSlug={homeworkSlug}
        homework={homework}
        submissions={submissions}
      />
    );
  }

  // Student view
  const result = await getHomeworkForStudent(homeworkId!);

  if (!result.success || !result.data) {
    return (
      <HomeworkNotFound error={result.error} />
    );
  }

  const { homework, submissions, attemptsUsed, attemptsRemaining } = result.data;

  return (
    <StudentView
      courseSlug={courseSlug}
      lessonSlug={lessonSlug}
      homework={homework}
      submissions={submissions}
      attemptsUsed={attemptsUsed}
      attemptsRemaining={attemptsRemaining}
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

async function TeacherView({
  courseSlug,
  lessonSlug,
  homeworkSlug,
  homework,
  submissions,
}: {
  courseSlug: string;
  lessonSlug: string;
  homeworkSlug: string;
  homework: any;
  submissions: any[];
}) {
  const t = await getTranslations("homework");
  const tCommon = await getTranslations("common");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/edit`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {tCommon("back")}
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">{homework.title}</h1>
          <Badge variant={homework.isPublished ? "default" : "secondary"}>
            {homework.isPublished ? t("published") : tCommon("draft")}
          </Badge>
          {homework.language && (
            <Badge variant="outline">
              <Code2 className="h-3 w-3 mr-1" />
              {LANGUAGE_LABELS[homework.language] || homework.language}
            </Badge>
          )}
        </div>
        <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/${homeworkSlug}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-2" />
            {tCommon("edit")}
          </Button>
        </Link>
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p className="whitespace-pre-wrap">{homework.description}</p>
      </div>

      <HomeworkSubmissions submissions={JSON.parse(JSON.stringify(submissions))} />
    </div>
  );
}

async function StudentView({
  courseSlug,
  lessonSlug,
  homework,
  submissions,
  attemptsUsed,
  attemptsRemaining,
}: {
  courseSlug: string;
  lessonSlug: string;
  homework: any;
  submissions: any[];
  attemptsUsed: number;
  attemptsRemaining: number;
}) {
  const tLessons = await getTranslations("lessons");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {tLessons("backToLesson")}
          </Button>
        </Link>
      </div>
      <HomeworkView
        homework={JSON.parse(JSON.stringify(homework))}
        submissions={JSON.parse(JSON.stringify(submissions))}
        attemptsUsed={attemptsUsed}
        attemptsRemaining={attemptsRemaining}
      />
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { HomeworkForm } from "@/components/homework/homework-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

interface NewHomeworkPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function NewHomeworkPage({ params }: NewHomeworkPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseId, lessonId } = await params;

  return <NewHomeworkPageContent courseId={courseId} lessonId={lessonId} />;
}

function NewHomeworkPageContent({ courseId, lessonId }: { courseId: string; lessonId: string }) {
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
        <h1 className="text-2xl font-bold">{t("createHomework")}</h1>
      </div>

      <HomeworkForm courseId={courseId} lessonId={lessonId} />
    </div>
  );
}

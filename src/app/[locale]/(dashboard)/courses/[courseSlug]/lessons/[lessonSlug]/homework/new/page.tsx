import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { HomeworkForm } from "@/components/homework/homework-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { resolveFullPath } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface NewHomeworkPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}

export default async function NewHomeworkPage({ params }: NewHomeworkPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseSlug, lessonSlug } = await params;
  const { courseId, lessonId } = await resolveFullPath({ courseSlug, lessonSlug });

  return <NewHomeworkPageContent courseSlug={courseSlug} lessonSlug={lessonSlug} lessonId={lessonId!} />;
}

async function NewHomeworkPageContent({ courseSlug, lessonSlug, lessonId }: { courseSlug: string; lessonSlug: string; lessonId: string }) {
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
        <h1 className="text-2xl font-bold">{t("createHomework")}</h1>
      </div>

      <HomeworkForm courseSlug={courseSlug} lessonSlug={lessonSlug} lessonId={lessonId} />
    </div>
  );
}

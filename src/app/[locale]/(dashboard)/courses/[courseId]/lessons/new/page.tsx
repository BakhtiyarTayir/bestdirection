import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { NewLessonClient } from "./new-lesson-client";
import { useTranslations } from "next-intl";

interface NewLessonPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function NewLessonPage({ params }: NewLessonPageProps) {
  const t = useTranslations("lessons");
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseId } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/courses/${courseId}/lessons`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t("createLesson")}</h1>
      </div>

      <NewLessonClient courseId={courseId} />
    </div>
  );
}

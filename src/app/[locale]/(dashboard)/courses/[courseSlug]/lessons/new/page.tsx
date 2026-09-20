import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { NewLessonClient } from "./new-lesson-client";
import { getTranslations } from "next-intl/server";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface NewLessonPageProps {
  params: Promise<{ courseSlug: string }>;
}

export default async function NewLessonPage({ params }: NewLessonPageProps) {
  const t = await getTranslations("lessons");
  const session = await getSession();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseSlug } = await params;
  const courseId = await resolveCourseSlug(courseSlug);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/courses/${courseSlug}/lessons`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t("createLesson")}</h1>
      </div>

      <NewLessonClient courseSlug={courseSlug} courseId={courseId} />
    </div>
  );
}

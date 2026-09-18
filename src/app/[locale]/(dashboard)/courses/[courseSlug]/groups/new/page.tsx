import { requireAuth } from "@/lib/auth-guard";
import { GroupForm } from "@/components/groups/group-form";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { getTranslations } from "next-intl/server";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface NewGroupPageProps {
  params: Promise<{ courseSlug: string }>;
}

export default async function NewGroupPage({ params }: NewGroupPageProps) {
  const t = await getTranslations("groups");
  const { courseSlug } = await params;
  const courseId = await resolveCourseSlug(courseSlug);
  await requireAuth();

  const teacherResult = await getTeacherOptions();
  const teachers = teacherResult.success ? teacherResult.data : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("createGroup")}</h1>
      <GroupForm courseId={courseId} courseSlug={courseSlug} teachers={teachers} />
    </div>
  );
}

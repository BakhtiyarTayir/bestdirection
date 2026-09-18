import { requireAuth } from "@/lib/auth-guard";
import { getGroupDetails } from "@/lib/api/groups.server";
import { notFound } from "next/navigation";
import { GroupForm } from "@/components/groups/group-form";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { getSmsTemplates } from "@/lib/api/sms.server";
import { BroadcastPanel } from "@/components/sms/broadcast-panel";
import { getTranslations } from "next-intl/server";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface GroupDetailPageProps {
  params: Promise<{ courseSlug: string; groupId: string }>;
}

export default async function GroupDetailPage({ params }: GroupDetailPageProps) {
  const t = await getTranslations("groups");
  const { courseSlug, groupId } = await params;
  const courseId = await resolveCourseSlug(courseSlug);
  await requireAuth();

  const result = await getGroupDetails(groupId);
  if (!result.success || !result.data) notFound();

  const group = result.data;

  const teacherResult = await getTeacherOptions();
  const teachers = teacherResult.success ? teacherResult.data : [];

  const templatesResult = await getSmsTemplates();
  const templates = templatesResult.success
    ? templatesResult.data.map((tpl) => ({ id: tpl.id, title: tpl.title, status: tpl.status }))
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("editGroup")}</h1>
      <GroupForm courseId={courseId} courseSlug={courseSlug} group={group} teachers={teachers} />
      <BroadcastPanel groupId={groupId} templates={templates} />
    </div>
  );
}

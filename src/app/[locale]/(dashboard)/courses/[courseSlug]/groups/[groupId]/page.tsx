import { requireAuth } from "@/lib/auth-guard";
import { getGroupDetails } from "@/lib/api/groups.server";
import { notFound } from "next/navigation";
import { GroupForm } from "@/components/groups/group-form";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { getBranches } from "@/lib/api/branches.server";
import { getSmsTemplates } from "@/lib/api/sms.server";
import { BroadcastPanel } from "@/components/sms/broadcast-panel";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { CalendarCheck } from "lucide-react";
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

  const [teacherResult, branchesResult] = await Promise.all([getTeacherOptions(), getBranches()]);
  const teachers = teacherResult.success ? teacherResult.data : [];
  // Выключенный филиал не предлагается в формах, кроме уже выбранного у этой
  // группы — иначе редактирование молча стёрло бы его при сохранении
  const branches = (branchesResult.success && branchesResult.data ? branchesResult.data : []).filter(
    (branch) => branch.isActive || branch.id === group.branchId
  );

  const templatesResult = await getSmsTemplates();
  const templates = templatesResult.success
    ? templatesResult.data.map((tpl) => ({ id: tpl.id, title: tpl.title, status: tpl.status }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("editGroup")}</h1>
        <Link href={`/courses/${courseSlug}/groups/${groupId}/attendance`}>
          <Button variant="outline" size="sm">
            <CalendarCheck className="mr-2 h-4 w-4" />
            {t("attendanceJournal")}
          </Button>
        </Link>
      </div>
      <GroupForm courseId={courseId} courseSlug={courseSlug} group={group} teachers={teachers} branches={branches} />
      <BroadcastPanel groupId={groupId} templates={templates} />
    </div>
  );
}

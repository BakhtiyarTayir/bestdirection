import { requireAuth } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getGroupStatistics } from "@/actions/group-actions";
import { notFound } from "next/navigation";
import { GroupStatistics } from "@/components/groups/group-statistics";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface GroupStatisticsPageProps {
  params: Promise<{ courseSlug: string; groupId: string }>;
}

export default async function GroupStatisticsPage({ params }: GroupStatisticsPageProps) {
  const t = await getTranslations("groups");
  const { courseSlug, groupId } = await params;
  await resolveCourseSlug(courseSlug);
  await requireAuth();

  const result = await getGroupStatistics(groupId);

  if (!result.success) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("statistics")}</h1>
        <p className="text-muted-foreground">{result.data.group.name}</p>
      </div>

      <GroupStatistics data={result.data} />
    </div>
  );
}

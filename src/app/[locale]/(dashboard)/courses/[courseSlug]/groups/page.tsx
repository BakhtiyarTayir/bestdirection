import { requireAuth } from "@/lib/auth-guard";
import { getCourseById } from "@/lib/api/courses.server";
import { getCourseGroups } from "@/actions/group-actions";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GroupList } from "@/components/groups/group-list";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface GroupsPageProps {
  params: Promise<{ courseSlug: string }>;
}

export default async function GroupsPage({ params }: GroupsPageProps) {
  const t = await getTranslations("groups");
  const { courseSlug } = await params;
  const courseId = await resolveCourseSlug(courseSlug);
  await requireAuth();

  const courseResult = await getCourseById(courseId);
  if (!courseResult.success || !courseResult.data) notFound();

  const groupsResult = await getCourseGroups(courseId);
  const groups = groupsResult.success ? groupsResult.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{courseResult.data.title}</p>
        </div>
        <Link href={`/courses/${courseSlug}/groups/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("createGroup")}
          </Button>
        </Link>
      </div>

      <GroupList groups={groups} courseSlug={courseSlug} />
    </div>
  );
}

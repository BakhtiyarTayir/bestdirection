import { requireAuth } from "@/lib/auth-guard";
import { getAllGroups } from "@/lib/api/groups.server";
import { getBranches } from "@/lib/api/branches.server";
import { Link } from "@/i18n/navigation";
import { UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { GroupList } from "@/components/groups/group-list";
import { BranchFilter } from "@/components/branch-filter";

export const dynamic = "force-dynamic";

interface AllGroupsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AllGroupsPage({ searchParams }: AllGroupsPageProps) {
  const t = await getTranslations("groups");
  await requireAuth();

  const params = await searchParams;
  const branchId = typeof params.branchId === "string" && params.branchId ? params.branchId : undefined;

  const [result, branchesResult] = await Promise.all([getAllGroups(branchId), getBranches()]);
  const groups = result.success ? result.data : [];
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];

  // Group by course
  const courseMap = new Map<string, { title: string; courseSlug: string; groups: typeof groups }>();
  for (const group of groups) {
    const key = group.course.id;
    if (!courseMap.has(key)) {
      courseMap.set(key, { title: group.course.title, courseSlug: group.course.slug, groups: [] });
    }
    courseMap.get(key)!.groups.push(group);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("allGroups")}</h1>
        <BranchFilter branchId={branchId} branches={branches} namespace="groups" />
      </div>

      {courseMap.size === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <UsersRound className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t("noGroups")}</h3>
          <p className="text-muted-foreground">
            {t("noGroupsMessage")}
          </p>
        </div>
      ) : (
        Array.from(courseMap.values()).map(({ title, courseSlug, groups: courseGroups }) => (
          <div key={courseSlug} className="space-y-4">
            <h2 className="text-lg font-semibold">
              <Link href={`/courses/${courseSlug}`} className="hover:underline">
                {title}
              </Link>
            </h2>
            <GroupList groups={courseGroups} courseSlug={courseSlug} />
          </div>
        ))
      )}
    </div>
  );
}

import { requireAuth } from "@/lib/auth-guard";
import { GroupForm } from "@/components/groups/group-form";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { getBranches } from "@/lib/api/branches.server";
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
  const session = await requireAuth();

  const [teacherResult, branchesResult] = await Promise.all([getTeacherOptions(), getBranches()]);
  const teachers = teacherResult.success ? teacherResult.data : [];
  // Выключенный филиал не предлагается в формах, но его история остаётся
  const branches = (branchesResult.success && branchesResult.data ? branchesResult.data : []).filter(
    (branch) => branch.isActive
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("createGroup")}</h1>
      <GroupForm courseId={courseId} courseSlug={courseSlug} teachers={teachers} branches={branches} canManageMoney={session.user.role === "ADMIN"} />
    </div>
  );
}

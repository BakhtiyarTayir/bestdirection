import { requireAuth } from "@/lib/auth-guard";
import { getGroupDetails } from "@/actions/group-actions";
import { notFound } from "next/navigation";
import { GroupForm } from "@/components/groups/group-form";

interface GroupDetailPageProps {
  params: Promise<{ courseId: string; groupId: string }>;
}

export default async function GroupDetailPage({ params }: GroupDetailPageProps) {
  const { courseId, groupId } = await params;
  await requireAuth();

  const result = await getGroupDetails(groupId);
  if (!result.success || !result.data) notFound();

  const group = result.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Редактировать группу</h1>
      <GroupForm courseId={courseId} group={group} />
    </div>
  );
}

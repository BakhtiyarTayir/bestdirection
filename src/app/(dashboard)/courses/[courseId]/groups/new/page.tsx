import { requireAuth } from "@/lib/auth-guard";
import { GroupForm } from "@/components/groups/group-form";

interface NewGroupPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function NewGroupPage({ params }: NewGroupPageProps) {
  const { courseId } = await params;
  await requireAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Создать группу</h1>
      <GroupForm courseId={courseId} />
    </div>
  );
}

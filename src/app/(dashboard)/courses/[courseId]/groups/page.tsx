import { requireAuth } from "@/lib/auth-guard";
import { getCourseById } from "@/actions/course-actions";
import { getCourseGroups } from "@/actions/group-actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GroupList } from "@/components/groups/group-list";

interface GroupsPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function GroupsPage({ params }: GroupsPageProps) {
  const { courseId } = await params;
  await requireAuth();

  const courseResult = await getCourseById(courseId);
  if (!courseResult.success || !courseResult.data) notFound();

  const groupsResult = await getCourseGroups(courseId);
  const groups = groupsResult.success ? groupsResult.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Группы</h1>
          <p className="text-muted-foreground">{courseResult.data.title}</p>
        </div>
        <Link href={`/courses/${courseId}/groups/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Создать группу
          </Button>
        </Link>
      </div>

      <GroupList groups={groups} courseId={courseId} />
    </div>
  );
}

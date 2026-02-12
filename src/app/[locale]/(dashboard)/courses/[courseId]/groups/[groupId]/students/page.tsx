import { requireAuth } from "@/lib/auth-guard";
import { useTranslations } from "next-intl";
import {
  getGroupDetails,
  getAvailableStudentsForGroup,
  getCourseGroups,
} from "@/actions/group-actions";
import { notFound } from "next/navigation";
import { GroupStudentsManager } from "@/components/groups/group-students-manager";

interface GroupStudentsPageProps {
  params: Promise<{ courseId: string; groupId: string }>;
}

export default async function GroupStudentsPage({ params }: GroupStudentsPageProps) {
  const t = useTranslations("groups");
  const { courseId, groupId } = await params;
  await requireAuth();

  const [groupResult, availableResult, allGroupsResult] = await Promise.all([
    getGroupDetails(groupId),
    getAvailableStudentsForGroup(groupId),
    getCourseGroups(courseId),
  ]);

  if (!groupResult.success || !groupResult.data) notFound();

  const group = groupResult.data;
  const students = group.enrollments.map((e: { student: typeof group.enrollments[number]["student"] }) => e.student);
  const availableStudents = availableResult.success ? availableResult.data : [];
  const otherGroups = allGroupsResult.success
    ? allGroupsResult.data
        .filter((g) => g.id !== groupId && g.isActive)
        .map((g) => ({ id: g.id, name: g.name }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("students", { count: students.length })}</h1>
        <p className="text-muted-foreground">{group.name}</p>
      </div>

      <GroupStudentsManager
        groupId={groupId}
        courseId={courseId}
        students={students}
        availableStudents={availableStudents}
        otherGroups={otherGroups}
      />
    </div>
  );
}

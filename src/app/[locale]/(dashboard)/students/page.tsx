import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getStudentsOverview } from "@/lib/api/billing.server";
import { getBranches } from "@/lib/api/branches.server";
import { getAllGroups, getTeacherOptions } from "@/lib/api/groups.server";
import { getCourses } from "@/lib/api/courses.server";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IssuePasswordsDialog } from "@/components/issue-passwords-dialog";
import { BranchFilter } from "@/components/branch-filter";
import { TeacherFilter } from "@/components/teacher-filter";
import { CourseFilter } from "@/components/course-filter";
import { GroupFilter } from "@/components/group-filter";
import { ExportCredentialsButton } from "@/components/export-credentials-button";
import { StudentList, type StudentListRow } from "./student-list";

export const dynamic = "force-dynamic";

interface StudentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("students");
  const tCommon = await getTranslations("common");
  const tBilling = await getTranslations("studentBilling");

  const params = await searchParams;
  const branchId = typeof params.branchId === "string" && params.branchId ? params.branchId : undefined;
  const teacherId = typeof params.teacherId === "string" && params.teacherId ? params.teacherId : undefined;

  const courseId = typeof params.courseId === "string" && params.courseId ? params.courseId : undefined;
  const groupId = typeof params.groupId === "string" && params.groupId ? params.groupId : undefined;

  const [result, branchesResult, teachersResult, coursesResult, groupsResult] = await Promise.all([
    getStudentsOverview({ branchId, teacherId, courseId, groupId }),
    getBranches(),
    getTeacherOptions(),
    getCourses(),
    getAllGroups(branchId),
  ]);
  const students = (result.success && result.data ? result.data : []) as StudentListRow[];
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];
  const teachers = teachersResult.success && teachersResult.data ? teachersResult.data : [];
  const courses = coursesResult.success && coursesResult.data ? coursesResult.data : [];
  // Группы фильтра — выбранного курса (и филиала: его применяет сам запрос)
  const allGroups = groupsResult.success && groupsResult.data ? groupsResult.data : [];
  const groups = courseId ? allGroups.filter((group) => group.course.id === courseId) : allGroups;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <BranchFilter branchId={branchId} branches={branches} namespace="students" />
        <TeacherFilter teacherId={teacherId} teachers={teachers} namespace="students" />
        <CourseFilter courseId={courseId} courses={courses} namespace="students" />
        <GroupFilter groupId={groupId} groups={groups} namespace="students" />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <ExportCredentialsButton filters={{ branchId, teacherId, courseId, groupId }} />
          <IssuePasswordsDialog branches={branches} defaultBranchId={branchId} />
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t("noStudents")}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{tCommon("number")}</TableHead>
                <TableHead>{tCommon("firstName")}</TableHead>
                <TableHead>{t("contacts")}</TableHead>
                <TableHead>{t("branch")}</TableHead>
                <TableHead>{t("courses")}</TableHead>
                <TableHead className="text-right">{tBilling("balance")}</TableHead>
                <TableHead className="text-right">{tCommon("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <StudentList students={students} />
          </Table>
        </div>
      )}
    </div>
  );
}

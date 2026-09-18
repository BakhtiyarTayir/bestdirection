import { requireRole } from "@/lib/auth-guard";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { getUsersHomeworkStatistics } from "@/lib/api/users.server";
import type { HomeworkSubmissionState } from "@/lib/api/users";
import { getLocale } from "next-intl/server";
import { UsersHomeworkStatistics } from "./users-homework-statistics";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

interface UsersStatisticsPageProps {
  searchParams: Promise<{
    courseId?: string;
    homeworkId?: string;
    groupId?: string;
    submissionState?: string;
  }>;
}

export default async function UsersStatisticsPage({
  searchParams,
}: UsersStatisticsPageProps) {
  await requireRole(["ADMIN", "TEACHER"]);
  const t = await getTranslations("users");
  const tCommon = await getTranslations("common");
  const params = await searchParams;

  const submissionState: HomeworkSubmissionState =
    params.submissionState === "PASSED" ||
    params.submissionState === "FAILED" ||
    params.submissionState === "NOT_SUBMITTED"
      ? params.submissionState
      : "ALL";

  const result = await getUsersHomeworkStatistics({
    courseId: params.courseId,
    homeworkId: params.homeworkId,
    groupId: params.groupId,
    submissionState,
    // Имена сортирует api, порядок букв зависит от языка интерфейса
    locale: await getLocale(),
  });

  const data = result.success
    ? result.data
    : {
        courses: [],
        homeworks: [],
        groups: [],
        summary: {
          totalStudents: 0,
          passedCount: 0,
          failedCount: 0,
          notSubmittedCount: 0,
          averageBestPercent: 0,
          onlineNowCount: 0,
        },
        rows: [],
      };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("statsTitle")}</h1>
          <p className="text-muted-foreground">{t("statsDescription")}</p>
        </div>
        <Link href="/users">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {tCommon("back")}
          </Button>
        </Link>
      </div>

      <UsersHomeworkStatistics
        courses={data.courses}
        homeworks={data.homeworks}
        groups={data.groups}
        rows={data.rows}
        summary={data.summary}
        selectedCourseId={params.courseId}
        selectedHomeworkId={params.homeworkId}
        selectedGroupId={params.groupId}
        selectedSubmissionState={submissionState}
      />
    </div>
  );
}

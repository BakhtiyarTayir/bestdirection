import { redirect } from "next/navigation";

interface LegacyUsersStatisticsPageProps {
  searchParams: Promise<{
    courseId?: string;
    homeworkId?: string;
    groupId?: string;
    submissionState?: string;
  }>;
}

export default async function LegacyUsersStatisticsPage({
  searchParams,
}: LegacyUsersStatisticsPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();

  if (params.courseId) qs.set("courseId", params.courseId);
  if (params.homeworkId) qs.set("homeworkId", params.homeworkId);
  if (params.groupId) qs.set("groupId", params.groupId);
  if (params.submissionState) qs.set("submissionState", params.submissionState);

  redirect(qs.toString() ? `/statistics?${qs.toString()}` : "/statistics");
}


import { requireRole } from "@/lib/auth-guard";
import { getPendingReviewSubmissions, getReviewHistory } from "@/actions/homework-review-actions";
import { getTranslations } from "next-intl/server";
import { TeacherReviewList } from "@/components/homework/teacher-review-list";

export default async function ReviewPage() {
  const t = await getTranslations("homeworkHub");
  await requireRole(["TEACHER", "ADMIN"]);

  const [pendingResult, historyResult] = await Promise.all([
    getPendingReviewSubmissions(),
    getReviewHistory(),
  ]);

  const pending = pendingResult.success ? pendingResult.data : [];
  const history = historyResult.success ? historyResult.data : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("review.title")}</h1>
      <TeacherReviewList pending={pending} history={history} />
    </div>
  );
}

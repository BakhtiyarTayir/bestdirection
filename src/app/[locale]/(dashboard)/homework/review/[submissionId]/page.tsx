import { requireRole } from "@/lib/auth-guard";
import { getSubmissionForReview } from "@/actions/homework-review-actions";
import { getTranslations } from "next-intl/server";
import { SubmissionReviewPage } from "@/components/homework/submission-review-page";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ submissionId: string }>;
}

export default async function ReviewSubmissionPage({ params }: Props) {
  const t = await getTranslations("homeworkHub");
  await requireRole(["TEACHER", "ADMIN"]);

  const { submissionId } = await params;
  const result = await getSubmissionForReview(submissionId);

  if (!result.success || !result.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("review.title")}</h1>
      <SubmissionReviewPage submission={result.data} />
    </div>
  );
}

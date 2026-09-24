import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth-guard";
import { getProgress } from "@/lib/api/progress.server";
import { ProgressView } from "@/components/progress/progress-view";

export const dynamic = "force-dynamic";

// Успеваемость ученика про себя (план PLAN-PARENT-PROGRESS-2026-09-24.md,
// раздел 1). Для родителя — тот же вид по каждому ребёнку на
// /my-children/[studentId]/progress; здесь всегда self, поэтому роль
// в маршруте ограничена сразу — незачем звать api ради 404 на персонал.
export default async function MyProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole(["STUDENT"]);
  const params = await searchParams;
  const month = typeof params.month === "string" && params.month ? params.month : undefined;

  const result = await getProgress(session.user.id, month);
  if (!result.success || !result.data) notFound();

  return <ProgressView data={result.data} />;
}

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth-guard";
import { getProgress } from "@/lib/api/progress.server";
import { ProgressView } from "@/components/progress/progress-view";

export const dynamic = "force-dynamic";

// Успеваемость ребёнка (план PLAN-PARENT-PROGRESS-2026-09-24.md, раздел 1):
// родитель — со своей карточки ребёнка, администратор — с карточки ученика в
// оплатах. Родство и лестница «педагог группы → педагог курса» проверяет api
// (ProgressService.forStudent) — чужой ребёнок вернётся как 404, не 403,
// поэтому здесь достаточно требовать вход одной из ролей, которым вообще
// может принадлежать доступ, а не гадать связь второй раз на web.
export default async function ChildProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["PARENT", "ADMIN", "TEACHER"]);
  const { studentId } = await params;
  const query = await searchParams;
  const month = typeof query.month === "string" && query.month ? query.month : undefined;

  const result = await getProgress(studentId, month);
  if (!result.success || !result.data) notFound();

  return <ProgressView data={result.data} />;
}

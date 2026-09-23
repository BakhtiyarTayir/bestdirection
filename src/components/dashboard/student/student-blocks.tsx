import type { ApiStudentDashboardBlock } from "@/lib/api/dashboard.server";
import { BalanceSummary } from "./balance-summary";
import { NextLessons } from "./next-lessons";
import { UpcomingHomeworks } from "./upcoming-homeworks";

/**
 * Три блока раздела 3 плана дашборда (баланс, следующее занятие, задания) —
 * одна и та же раскладка для собственного кабинета ученика и для каждого
 * ребёнка в кабинете родителя.
 */
export function StudentBlocks({
  block,
  locale,
}: {
  block: ApiStudentDashboardBlock;
  locale: string;
}) {
  return (
    <div className="space-y-4">
      <BalanceSummary billing={block.billing} locale={locale} />
      <div className="grid gap-4 md:grid-cols-2">
        <NextLessons lessons={block.nextLessons} />
        <UpcomingHomeworks homeworks={block.homeworks} />
      </div>
    </div>
  );
}

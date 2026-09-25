import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getGroupDetails } from "@/lib/api/groups.server";
import { RosterTable, type RosterStudent } from "./roster-table";

export const dynamic = "force-dynamic";

interface GroupRosterPageProps {
  params: Promise<{ courseSlug: string; groupId: string }>;
}

/**
 * Список учеников группы — только просмотр: контакты, Telegram, ссылка на
 * успеваемость. Добавление и перевод — на соседнем экране «Добавить учеников»,
 * там две колонки и поиск, для просмотра состава это лишнее.
 */
export default async function GroupRosterPage({ params }: GroupRosterPageProps) {
  await requireRole(["ADMIN", "TEACHER"]);
  const t = await getTranslations("groups");
  const { groupId } = await params;

  const result = await getGroupDetails(groupId);
  if (!result.success || !result.data) notFound();

  const group = result.data;
  const students: RosterStudent[] = group.enrollments
    .map((enrollment: { student: RosterStudent }) => enrollment.student)
    .sort((a: RosterStudent, b: RosterStudent) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("studentList")}</h1>
        <p className="text-muted-foreground">
          {group.name} · {t("students", { count: students.length })}
        </p>
      </div>
      <RosterTable students={students} />
    </div>
  );
}

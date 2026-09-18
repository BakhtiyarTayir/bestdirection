import { requireRole } from "@/lib/auth-guard";
import { getStudentHomeworks } from "@/lib/api/homework.server";
import { getTranslations } from "next-intl/server";
import { StudentHomeworkList } from "@/components/homework/student-homework-list";

export default async function StudentHomeworkPage() {
  const t = await getTranslations("homeworkHub");
  await requireRole(["STUDENT"]);

  const result = await getStudentHomeworks();
  const homeworks = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <StudentHomeworkList homeworks={homeworks} />
    </div>
  );
}

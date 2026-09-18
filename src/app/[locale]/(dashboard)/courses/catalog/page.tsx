import { requireRole } from "@/lib/auth-guard";
import { getCoursesForCopy } from "@/lib/api/courses.server";
import { CourseCatalogList } from "@/components/course-catalog-list";
import { useTranslations } from "next-intl";

export const dynamic = "force-dynamic";

export default function CourseCatalogPage() {
  const t = useTranslations("catalog");
  return <CourseCatalogPageAsync t={t} />;
}

async function CourseCatalogPageAsync({
  t,
}: {
  t: ReturnType<typeof useTranslations<"catalog">>;
}) {
  await requireRole(["ADMIN", "TEACHER"]);

  const result = await getCoursesForCopy();

  if (!result.success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-destructive">{t("loadError")}</p>
      </div>
    );
  }

  const courses = result.data;
  const templates = courses.filter((c) => c.isTemplate);
  const published = courses.filter((c) => !c.isTemplate);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {templates.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">
            {t("courseTemplates")}
          </h2>
          <CourseCatalogList courses={templates} />
        </section>
      )}

      {published.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">
            {t("teacherCourses")}
          </h2>
          <CourseCatalogList courses={published} />
        </section>
      )}

      {courses.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("noCoursesAvailable")}</p>
        </div>
      )}
    </div>
  );
}

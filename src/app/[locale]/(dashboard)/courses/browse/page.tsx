import { requireRole } from "@/lib/auth-guard";
import { getCatalogCourses } from "@/lib/api/courses.server";
import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";
import { CatalogCourseCard } from "./catalog-course-card";

export const dynamic = "force-dynamic";

export default async function BrowseCoursesPage() {
  await requireRole(["STUDENT"]);
  const t = await getTranslations("catalogStudent");

  const result = await getCatalogCourses();
  const courses = result.success && result.data ? result.data : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">{t("empty")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CatalogCourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

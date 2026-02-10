import { requireRole } from "@/lib/auth-guard";
import { getCoursesForCopy } from "@/actions/course-copy-actions";
import { CourseCatalogList } from "@/components/course-catalog-list";

export default async function CourseCatalogPage() {
  await requireRole(["ADMIN", "TEACHER"]);

  const result = await getCoursesForCopy();

  if (!result.success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Каталог курсов</h1>
        <p className="text-destructive">Ошибка загрузки каталога</p>
      </div>
    );
  }

  const courses = result.data;
  const templates = courses.filter((c) => c.isTemplate);
  const published = courses.filter((c) => !c.isTemplate);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Каталог курсов</h1>
        <p className="text-muted-foreground">
          Выберите курс для копирования в свой аккаунт
        </p>
      </div>

      {templates.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Шаблоны курсов
          </h2>
          <CourseCatalogList courses={templates} />
        </section>
      )}

      {published.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Курсы преподавателей
          </h2>
          <CourseCatalogList courses={published} />
        </section>
      )}

      {courses.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Нет доступных курсов для копирования</p>
        </div>
      )}
    </div>
  );
}

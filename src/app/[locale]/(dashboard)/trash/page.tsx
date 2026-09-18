import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getDeletedCourses, getDeletedLessons } from "@/lib/api/courses.server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrashTable } from "@/components/trash-table";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const t = await getTranslations("trash");
  await requireRole(["ADMIN"]);

  // Пользователей здесь нет намеренно: их не удаляют мягко, а деактивируют,
  // и живут они на вкладке «Деактивированные» в разделе пользователей.
  const [coursesResult, lessonsResult] = await Promise.all([
    getDeletedCourses(),
    getDeletedLessons(),
  ]);

  const courses = coursesResult.success ? coursesResult.data : [];
  const lessons = lessonsResult.success ? lessonsResult.data : [];

  const totalCount = courses.length + lessons.length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">
          {totalCount > 0
            ? t("deletedCount", { count: totalCount })
            : t("emptyTrash")}
        </p>
      </div>

      <Tabs defaultValue="courses">
        <TabsList>
          <TabsTrigger value="courses">
            {t("courses")} {courses.length > 0 && `(${courses.length})`}
          </TabsTrigger>
          <TabsTrigger value="lessons">
            {t("lessons")} {lessons.length > 0 && `(${lessons.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4">
          <TrashTable items={courses} type="course" />
        </TabsContent>

        <TabsContent value="lessons" className="mt-4">
          <TrashTable items={lessons} type="lesson" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { requireRole } from "@/lib/auth-guard";
import { useTranslations } from "next-intl";
import {
  getDeletedCourses,
  getDeletedUsers,
  getDeletedLessons,
  restoreCourse,
  restoreUser,
  restoreLesson,
  hardDeleteCourse,
  hardDeleteUser,
  hardDeleteLesson,
} from "@/actions/admin-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrashTable } from "@/components/trash-table";

export default async function TrashPage() {
  const t = useTranslations("trash");
  await requireRole(["ADMIN"]);

  const [coursesResult, usersResult, lessonsResult] = await Promise.all([
    getDeletedCourses(),
    getDeletedUsers(),
    getDeletedLessons(),
  ]);

  const courses = coursesResult.success ? coursesResult.data : [];
  const users = usersResult.success ? usersResult.data : [];
  const lessons = lessonsResult.success ? lessonsResult.data : [];

  const totalCount = courses.length + users.length + lessons.length;

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
          <TabsTrigger value="users">
            {t("users")} {users.length > 0 && `(${users.length})`}
          </TabsTrigger>
          <TabsTrigger value="lessons">
            {t("lessons")} {lessons.length > 0 && `(${lessons.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4">
          <TrashTable
            items={courses}
            type="course"
            onRestore={restoreCourse}
            onHardDelete={hardDeleteCourse}
          />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <TrashTable
            items={users}
            type="user"
            onRestore={restoreUser}
            onHardDelete={hardDeleteUser}
          />
        </TabsContent>

        <TabsContent value="lessons" className="mt-4">
          <TrashTable
            items={lessons}
            type="lesson"
            onRestore={restoreLesson}
            onHardDelete={hardDeleteLesson}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

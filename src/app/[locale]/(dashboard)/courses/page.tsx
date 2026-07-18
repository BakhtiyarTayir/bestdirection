import { requireAuth } from "@/lib/auth-guard";
import { getCourses } from "@/actions/course-actions";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, BookOpen, Users, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

export const dynamic = "force-dynamic";

export default function CoursesPage() {
  const t = useTranslations("courses");
  const tCommon = useTranslations("common");
  return <CoursesPageAsync t={t} tCommon={tCommon} />;
}

async function CoursesPageAsync({
  t,
  tCommon,
}: {
  t: ReturnType<typeof useTranslations<"courses">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
}) {
  const session = await requireAuth();
  const role = session.user.role;

  const result = await getCourses();
  const courses = result.success && result.data ? result.data : [];

  const canCreate = role === "ADMIN" || role === "TEACHER";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        {canCreate && (
          <Link href="/courses/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("createCourse")}
            </Button>
          </Link>
        )}
        {role === "STUDENT" && (
          <Link href="/courses/browse">
            <Button variant="outline">
              <BookOpen className="mr-2 h-4 w-4" />
              {t("browseCatalog")}
            </Button>
          </Link>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">{t("noCourses")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {canCreate
              ? t("createFirstCourse")
              : t("notEnrolled")}
          </p>
          {canCreate && (
            <Link href="/courses/new">
              <Button className="mt-4" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                {t("createCourse")}
              </Button>
            </Link>
          )}
          {role === "STUDENT" && (
            <Link href="/courses/browse">
              <Button className="mt-4">
                <BookOpen className="mr-2 h-4 w-4" />
                {t("browseCatalog")}
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col overflow-hidden">
              {course.coverImage ? (
                <div className="relative aspect-video">
                  <Image
                    src={course.coverImage}
                    alt={course.title}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center aspect-video bg-muted">
                  <BookOpen className="h-12 w-12 text-muted-foreground/50" />
                </div>
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg line-clamp-2">
                    {course.title}
                  </CardTitle>
                  {course.isPublished ? (
                    <Badge>{tCommon("published")}</Badge>
                  ) : (
                    <Badge variant="secondary">{tCommon("draft")}</Badge>
                  )}
                </div>
                <CardDescription className="line-clamp-3">
                  {course.description || t("noDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-2 text-sm text-muted-foreground">
                  {(role === "ADMIN" || role === "STUDENT") && (
                    <p>
                      {t("teacherLabel")}: {course.teacher.firstName}{" "}
                      {course.teacher.lastName}
                    </p>
                  )}
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {course._count.lessons} {t("lessons")}
                    </span>
                    {(role === "ADMIN" || role === "TEACHER") && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {course._count.enrollments} {t("studentsCount")}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Link href={`/courses/${course.slug}`} className="w-full">
                  <Button variant="outline" className="w-full">
                    {t("details")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

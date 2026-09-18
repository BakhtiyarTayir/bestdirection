import { requireRole } from "@/lib/auth-guard";
import { getUsers } from "@/lib/api/users.server";
import { CourseForm } from "@/components/course-form";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

export const dynamic = "force-dynamic";

export default function NewCoursePage() {
  const t = useTranslations("courses");
  return <NewCoursePageAsync t={t} />;
}

async function NewCoursePageAsync({ t }: { t: ReturnType<typeof useTranslations<"courses">> }) {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const role = session.user.role;
  const userId = session.user.id;

  let teachers: { id: string; firstName: string; lastName: string; email: string | null }[] = [];

  if (role === "ADMIN") {
    const result = await getUsers();
    if (result.success && result.data) {
      teachers = result.data
        .filter((u) => u.role === "TEACHER" && u.isActive)
        .map((u) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
        }));
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/courses">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToCourses")}
          </Button>
        </Link>
      </div>

      <CourseForm
        teachers={teachers}
        currentUserId={userId}
        currentUserRole={role}
      />
    </div>
  );
}

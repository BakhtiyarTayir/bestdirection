import { requireRole } from "@/lib/auth-guard";
import { getUsers } from "@/actions/user-actions";
import { CourseForm } from "@/components/course-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function NewCoursePage() {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const role = session.user.role;
  const userId = session.user.id;

  let teachers: { id: string; firstName: string; lastName: string; email: string }[] = [];

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
            Назад к курсам
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

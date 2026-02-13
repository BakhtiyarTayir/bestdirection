import { requireRole } from "@/lib/auth-guard";
import { getCourseById } from "@/actions/course-actions";
import { getUsers } from "@/actions/user-actions";
import { CourseForm } from "@/components/course-form";
import { notFound } from "next/navigation";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

interface EditCoursePageProps {
  params: Promise<{ courseSlug: string }>;
}

export default async function EditCoursePage({ params }: EditCoursePageProps) {
  const { courseSlug } = await params;
  const courseId = await resolveCourseSlug(courseSlug);
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const role = session.user.role;
  const userId = session.user.id;

  const result = await getCourseById(courseId);
  if (!result.success || !result.data) {
    notFound();
  }

  const course = result.data;

  // Teachers can only edit their own courses
  if (role === "TEACHER" && course.teacherId !== userId) {
    notFound();
  }

  let teachers: { id: string; firstName: string; lastName: string; email: string }[] = [];

  if (role === "ADMIN") {
    const usersResult = await getUsers();
    if (usersResult.success && usersResult.data) {
      teachers = usersResult.data
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
      <CourseForm
        course={{
          id: course.id,
          title: course.title,
          description: course.description,
          coverImage: course.coverImage,
          teacherId: course.teacherId,
          isPublished: course.isPublished,
        }}
        teachers={teachers}
        currentUserId={userId}
        currentUserRole={role}
      />
    </div>
  );
}

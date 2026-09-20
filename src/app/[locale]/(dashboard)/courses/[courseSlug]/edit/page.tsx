import { requireRole } from "@/lib/auth-guard";
import { getCourseById } from "@/lib/api/courses.server";
import { getUsers } from "@/lib/api/users.server";
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

  let teachers: { id: string; firstName: string; lastName: string; login: string | null }[] = [];

  if (role === "ADMIN") {
    const usersResult = await getUsers();
    if (usersResult.success && usersResult.data) {
      teachers = usersResult.data
        .filter((u) => u.role === "TEACHER" && u.isActive)
        .map((u) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          login: u.login,
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
          accessType: course.accessType,
          isPublicListed: course.isPublicListed,
          price: course.price,
          publicSummaryRu: course.publicSummaryRu,
          publicSummaryUz: course.publicSummaryUz,
          intakeStartDate: course.intakeStartDate,
          intakeSeats: course.intakeSeats,
          intakeNoteRu: course.intakeNoteRu,
          intakeNoteUz: course.intakeNoteUz,
        }}
        teachers={teachers}
        currentUserId={userId}
        currentUserRole={role}
      />
    </div>
  );
}

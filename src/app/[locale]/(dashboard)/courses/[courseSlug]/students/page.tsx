import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import {
  getCourseById,
  getEnrolledStudents,
  getAvailableStudents,
} from "@/actions/course-actions";
import { StudentEnrollment } from "@/components/student-enrollment";
import { notFound } from "next/navigation";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface StudentsPageProps {
  params: Promise<{ courseSlug: string }>;
}

export default async function StudentsPage({ params }: StudentsPageProps) {
  const t = await getTranslations("courses");
  const { courseSlug } = await params;
  const courseId = await resolveCourseSlug(courseSlug);
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const role = session.user.role;
  const userId = session.user.id;

  const courseResult = await getCourseById(courseId);
  if (!courseResult.success || !courseResult.data) {
    notFound();
  }

  const course = courseResult.data;

  // Teachers can only manage students of their own courses
  if (role === "TEACHER" && course.teacherId !== userId) {
    notFound();
  }

  const [enrolledResult, availableResult] = await Promise.all([
    getEnrolledStudents(courseId),
    getAvailableStudents(courseId),
  ]);

  const enrolledStudents = enrolledResult.success && enrolledResult.data ? enrolledResult.data : [];
  const availableStudents = availableResult.success && availableResult.data ? availableResult.data : [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-3xl font-bold">{course.title}</h1>
        <p className="text-muted-foreground">{t("manageStudents")}</p>
      </div>

      <StudentEnrollment
        courseId={courseId}
        enrolledStudents={enrolledStudents}
        availableStudents={availableStudents}
      />
    </div>
  );
}

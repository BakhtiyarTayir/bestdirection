import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, ClipboardCheck, FileText, GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;

  if (role === "ADMIN") return <AdminDashboard />;
  if (role === "TEACHER") return <TeacherDashboard userId={session.user.id} />;
  return <StudentDashboard userId={session.user.id} />;
}

async function AdminDashboard() {
  const t = await getTranslations("dashboard");
  const [userCount, courseCount, studentCount, teacherCount] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.count({ where: { role: "TEACHER" } }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("adminTitle")}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("users")} value={userCount} icon={Users} />
        <StatCard title={t("courses")} value={courseCount} icon={BookOpen} />
        <StatCard title={t("teachers")} value={teacherCount} icon={GraduationCap} />
        <StatCard title={t("students")} value={studentCount} icon={ClipboardCheck} />
      </div>
    </div>
  );
}

async function TeacherDashboard({ userId }: { userId: string }) {
  const t = await getTranslations("dashboard");
  const [courseCount, studentCount] = await Promise.all([
    prisma.course.count({ where: { teacherId: userId } }),
    prisma.enrollment.count({
      where: { course: { teacherId: userId } },
    }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("teacherTitle")}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t("myCourses")}
          value={courseCount}
          icon={BookOpen}
          href="/courses"
        />
        <StatCard
          title={t("enrolledStudents")}
          value={studentCount}
          icon={Users}
          href="/users/statistics"
        />
      </div>
    </div>
  );
}

async function StudentDashboard({ userId }: { userId: string }) {
  const t = await getTranslations("dashboard");
  const [enrollmentCount, attemptCount] = await Promise.all([
    prisma.enrollment.count({ where: { studentId: userId } }),
    prisma.assessmentAttempt.count({ where: { studentId: userId } }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">{t("studentTitle")}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title={t("myCourses")} value={enrollmentCount} icon={BookOpen} />
        <StatCard title={t("testsPassed")} value={attemptCount} icon={FileText} />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  href?: string;
}) {
  const content = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}

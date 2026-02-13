import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, ClipboardCheck, FileText, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;

  if (role === "ADMIN") return <AdminDashboard />;
  if (role === "TEACHER") return <TeacherDashboard userId={session.user.id} />;
  return <StudentDashboard userId={session.user.id} />;
}

function AdminDashboard() {
  const t = useTranslations("dashboard");
  return <AdminDashboardAsync t={t} />;
}

async function AdminDashboardAsync({ t }: { t: ReturnType<typeof useTranslations<"dashboard">> }) {
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

function TeacherDashboard({ userId }: { userId: string }) {
  const t = useTranslations("dashboard");
  return <TeacherDashboardAsync userId={userId} t={t} />;
}

async function TeacherDashboardAsync({ userId, t }: { userId: string; t: ReturnType<typeof useTranslations<"dashboard">> }) {
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
        <StatCard title={t("myCourses")} value={courseCount} icon={BookOpen} />
        <StatCard title={t("enrolledStudents")} value={studentCount} icon={Users} />
      </div>
    </div>
  );
}

function StudentDashboard({ userId }: { userId: string }) {
  const t = useTranslations("dashboard");
  return <StudentDashboardAsync userId={userId} t={t} />;
}

async function StudentDashboardAsync({ userId, t }: { userId: string; t: ReturnType<typeof useTranslations<"dashboard">> }) {
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

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
  return (
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
}

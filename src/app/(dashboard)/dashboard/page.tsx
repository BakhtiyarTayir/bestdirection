import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, ClipboardCheck, FileText, GraduationCap } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;

  if (role === "ADMIN") return <AdminDashboard />;
  if (role === "TEACHER") return <TeacherDashboard userId={session.user.id} />;
  return <StudentDashboard userId={session.user.id} />;
}

async function AdminDashboard() {
  const [userCount, courseCount, studentCount, teacherCount] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.count({ where: { role: "TEACHER" } }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Панель администратора</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Пользователей" value={userCount} icon={Users} />
        <StatCard title="Курсов" value={courseCount} icon={BookOpen} />
        <StatCard title="Преподавателей" value={teacherCount} icon={GraduationCap} />
        <StatCard title="Студентов" value={studentCount} icon={ClipboardCheck} />
      </div>
    </div>
  );
}

async function TeacherDashboard({ userId }: { userId: string }) {
  const [courseCount, studentCount] = await Promise.all([
    prisma.course.count({ where: { teacherId: userId } }),
    prisma.enrollment.count({
      where: { course: { teacherId: userId } },
    }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Панель преподавателя</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Моих курсов" value={courseCount} icon={BookOpen} />
        <StatCard title="Записанных студентов" value={studentCount} icon={Users} />
      </div>
    </div>
  );
}

async function StudentDashboard({ userId }: { userId: string }) {
  const [enrollmentCount, attemptCount] = await Promise.all([
    prisma.enrollment.count({ where: { studentId: userId } }),
    prisma.testAttempt.count({ where: { studentId: userId } }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Мой дашборд</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Моих курсов" value={enrollmentCount} icon={BookOpen} />
        <StatCard title="Пройдено тестов" value={attemptCount} icon={FileText} />
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

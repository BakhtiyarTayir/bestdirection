import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users } from "lucide-react";

interface ExamAttemptsPageProps {
  params: Promise<{
    courseId: string;
    examId: string;
  }>;
}

export default async function ExamAttemptsPage({ params }: ExamAttemptsPageProps) {
  const { courseId, examId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect(`/courses/${courseId}/exams/${examId}`);
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      course: {
        select: { id: true, title: true, teacherId: true },
      },
    },
  });

  if (!exam) redirect(`/courses/${courseId}/exams`);

  if (role === "TEACHER" && exam.course.teacherId !== session.user.id) {
    redirect(`/courses/${courseId}`);
  }

  const attempts = await prisma.examAttempt.findMany({
    where: { examId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const totalAttempts = attempts.length;
  const passedAttempts = attempts.filter((a) => a.isPassed).length;
  const uniqueStudents = new Set(attempts.map((a) => a.studentId)).size;
  const avgPercentage =
    totalAttempts > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts
        )
      : 0;

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {exam.course.title} / Экзамены
        </p>
        <h1 className="text-3xl font-bold mt-1">
          Результаты: {exam.title}
        </h1>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{totalAttempts}</p>
            <p className="text-xs text-muted-foreground">Всего попыток</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{uniqueStudents}</p>
            <p className="text-xs text-muted-foreground">Студентов</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-green-600">
              {passedAttempts}
            </p>
            <p className="text-xs text-muted-foreground">Сдали</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{avgPercentage}%</p>
            <p className="text-xs text-muted-foreground">Средний балл</p>
          </CardContent>
        </Card>
      </div>

      {/* Attempts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Попытки студентов
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Пока никто не проходил этот экзамен.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Студент</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Баллы</TableHead>
                    <TableHead className="text-center">Процент</TableHead>
                    <TableHead className="text-center">Статус</TableHead>
                    <TableHead>Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">
                        {attempt.student.lastName} {attempt.student.firstName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {attempt.student.email}
                      </TableCell>
                      <TableCell className="text-center">
                        {attempt.score} / {attempt.maxScore}
                      </TableCell>
                      <TableCell className="text-center">
                        {attempt.percentage}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            attempt.isPassed ? "default" : "destructive"
                          }
                        >
                          {attempt.isPassed ? "Зачтено" : "Не зачтено"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(attempt.startedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

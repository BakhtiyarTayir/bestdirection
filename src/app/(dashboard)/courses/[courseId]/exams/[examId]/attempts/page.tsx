import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users } from "lucide-react";
import { AttemptDetailRow } from "@/components/attempt-detail-row";
import { formatDateTime } from "@/lib/format-date";

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

  const assessment = await prisma.assessment.findUnique({
    where: { id: examId },
    include: {
      course: {
        select: { id: true, title: true, teacherId: true },
      },
    },
  });

  if (!assessment || assessment.type !== "EXAM") redirect(`/courses/${courseId}/exams`);

  if (role === "TEACHER" && assessment.course.teacherId !== session.user.id) {
    redirect(`/courses/${courseId}`);
  }

  const attempts = await prisma.assessmentAttempt.findMany({
    where: { assessmentId: examId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      answers: {
        include: {
          question: {
            include: {
              options: { orderBy: { sortOrder: "asc" } },
            },
          },
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {assessment.course.title} / Экзамены
        </p>
        <h1 className="text-3xl font-bold mt-1">
          Результаты: {assessment.title}
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
          <p className="text-sm text-muted-foreground">
            Нажмите на строку, чтобы увидеть ответы на вопросы
          </p>
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
                    <AttemptDetailRow
                      key={attempt.id}
                      colSpan={6}
                      attempt={{
                        id: attempt.id,
                        score: attempt.score,
                        maxScore: attempt.maxScore,
                        percentage: attempt.percentage,
                        isPassed: attempt.isPassed,
                        startedAt: formatDateTime(attempt.startedAt),
                        studentName: `${attempt.student.lastName} ${attempt.student.firstName}`,
                        studentEmail: attempt.student.email,
                        answers: attempt.answers.map((a) => ({
                          id: a.id,
                          selectedOptionIds: a.selectedOptionIds,
                          isCorrect: a.isCorrect,
                          pointsEarned: a.pointsEarned,
                          question: {
                            id: a.question.id,
                            text: a.question.text,
                            points: a.question.points,
                            options: a.question.options.map((o) => ({
                              id: o.id,
                              text: o.text,
                              isCorrect: o.isCorrect,
                            })),
                          },
                        })),
                      }}
                    />
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

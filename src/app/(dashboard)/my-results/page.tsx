import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Trophy, CheckCircle2, GraduationCap } from "lucide-react";

export default async function MyResultsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "STUDENT") {
    redirect("/dashboard");
  }

  const allAttempts = await prisma.assessmentAttempt.findMany({
    where: { studentId: session.user.id },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          type: true,
          passingScore: true,
          courseId: true,
          lessonId: true,
          lesson: {
            select: {
              id: true,
              title: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const testAttempts = allAttempts.filter((a) => a.assessment.type === "TEST");
  const examAttempts = allAttempts.filter((a) => a.assessment.type === "EXAM");

  // Stats (combined)
  const totalAttempts = allAttempts.length;
  const passedAttempts = allAttempts.filter((a) => a.isPassed).length;
  const avgPercentage =
    totalAttempts > 0
      ? Math.round(
          allAttempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts
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
      <h1 className="text-3xl font-bold">Мои результаты</h1>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalAttempts}</p>
                <p className="text-xs text-muted-foreground">Всего попыток</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {passedAttempts}
                </p>
                <p className="text-xs text-muted-foreground">Успешных</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{avgPercentage}%</p>
                <p className="text-xs text-muted-foreground">Средний балл</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>История тестов</CardTitle>
        </CardHeader>
        <CardContent>
          {testAttempts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Вы еще не проходили ни одного теста.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead>Урок</TableHead>
                    <TableHead>Тест</TableHead>
                    <TableHead className="text-center">Баллы</TableHead>
                    <TableHead className="text-center">Процент</TableHead>
                    <TableHead className="text-center">Статус</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">
                        {attempt.assessment.course.title}
                      </TableCell>
                      <TableCell>
                        {attempt.assessment.lesson?.title ?? "—"}
                      </TableCell>
                      <TableCell>{attempt.assessment.title}</TableCell>
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
                      <TableCell>
                        {attempt.assessment.lessonId && (
                          <Link
                            href={`/courses/${attempt.assessment.course.id}/lessons/${attempt.assessment.lessonId}/test`}
                          >
                            <Button variant="ghost" size="sm">
                              Подробнее
                            </Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exam Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            История экзаменов
          </CardTitle>
        </CardHeader>
        <CardContent>
          {examAttempts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Вы еще не проходили ни одного экзамена.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead>Экзамен</TableHead>
                    <TableHead className="text-center">Баллы</TableHead>
                    <TableHead className="text-center">Процент</TableHead>
                    <TableHead className="text-center">Статус</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">
                        {attempt.assessment.course.title}
                      </TableCell>
                      <TableCell>{attempt.assessment.title}</TableCell>
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
                      <TableCell>
                        <Link
                          href={`/courses/${attempt.assessment.course.id}/exams/${attempt.assessment.id}`}
                        >
                          <Button variant="ghost" size="sm">
                            Подробнее
                          </Button>
                        </Link>
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

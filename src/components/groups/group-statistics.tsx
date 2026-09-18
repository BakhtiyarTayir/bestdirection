"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, CalendarCheck, BookOpen, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";

interface StudentStat {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  attendancePercent: number;
  attendancePresent: number;
  attendanceTotal: number;
  homeworkCompleted: number;
  homeworkTotal: number;
  homeworkAvgScore: number;
  examsPassed: number;
  examsTotal: number;
  examAvgScore: number;
  overallScore: number;
}

interface GroupStatisticsData {
  group: {
    id: string;
    name: string;
    course: { id: string; title: string; slug: string };
  };
  summary: {
    totalStudents: number;
    avgAttendance: number;
    avgHomeworkScore: number;
    avgExamScore: number;
    totalHomeworks: number;
    totalAssessments: number;
    totalSessions: number;
  };
  students: StudentStat[];
}

interface GroupStatisticsProps {
  data: GroupStatisticsData;
}

function ScoreBadge({ score }: { score: number }) {
  const colorClass =
    score >= 70
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 50
        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
        : "bg-red-100 text-red-800 border-red-200";

  return (
    <Badge variant="outline" className={colorClass}>
      {score}%
    </Badge>
  );
}

export function GroupStatistics({ data }: GroupStatisticsProps) {
  const t = useTranslations("groups");
  const { summary, students } = data;

  if (summary.totalStudents === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">{t("noStatistics")}</h3>
      </div>
    );
  }

  const sortedStudents = [...students].sort((a, b) => b.overallScore - a.overallScore);

  const summaryCards = [
    {
      title: t("totalStudents"),
      value: summary.totalStudents,
      icon: Users,
      showProgress: false,
    },
    {
      title: t("avgAttendance"),
      value: summary.avgAttendance,
      suffix: "%",
      icon: CalendarCheck,
      showProgress: true,
    },
    {
      title: t("avgHomeworkScore"),
      value: summary.avgHomeworkScore,
      suffix: "%",
      icon: BookOpen,
      showProgress: true,
    },
    {
      title: t("avgExamScore"),
      value: summary.avgExamScore,
      suffix: "%",
      icon: GraduationCap,
      showProgress: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {card.value}
                {card.suffix}
              </div>
              {card.showProgress && (
                <Progress value={card.value} className="mt-2 h-2" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("studentName")}</TableHead>
                <TableHead className="text-center">{t("attendanceCol")}</TableHead>
                <TableHead className="text-center">{t("homeworkCol")}</TableHead>
                <TableHead className="text-center">{t("examCol")}</TableHead>
                <TableHead className="text-center">{t("overallScore")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    {student.firstName} {student.lastName}
                  </TableCell>
                  <TableCell className="text-center">
                    <div>{student.attendancePercent}%</div>
                    <div className="text-xs text-muted-foreground">
                      ({student.attendancePresent}/{student.attendanceTotal})
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="text-xs text-muted-foreground">
                      {t("completed", {
                        done: student.homeworkCompleted,
                        total: student.homeworkTotal,
                      })}
                    </div>
                    {student.homeworkCompleted > 0 && (
                      <div className="text-sm">avg {student.homeworkAvgScore}%</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="text-xs text-muted-foreground">
                      {t("passed", {
                        done: student.examsPassed,
                        total: student.examsTotal,
                      })}
                    </div>
                    {student.examsPassed > 0 && (
                      <div className="text-sm">avg {student.examAvgScore}%</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <ScoreBadge score={student.overallScore} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

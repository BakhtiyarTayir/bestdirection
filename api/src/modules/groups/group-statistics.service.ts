import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Сводка по группе: посещаемость, домашние задания и экзамены каждого ученика.
 * Перенесено из src/actions/group-actions.ts в web; формулы сохранены —
 * посещаемость весит 20%, домашние задания и экзамены по 40%.
 */
@Injectable()
export class GroupStatisticsService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async build(groupId: string) {
const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        enrollments: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundException("groupNotFound");

    const courseId = group.courseId;
    const studentIds = group.enrollments.map((e) => e.student.id);

    if (studentIds.length === 0) {
      return {
        group: { id: group.id, name: group.name, course: group.course },
        summary: {
          totalStudents: 0,
          avgAttendance: 0,
          avgHomeworkScore: 0,
          avgExamScore: 0,
          totalHomeworks: 0,
          totalAssessments: 0,
          totalSessions: 0,
        },
        students: [],
      };
    }

    const [attendanceSessions, homeworks, assessments] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where: { courseId, groupId },
        include: {
          records: {
            where: { studentId: { in: studentIds } },
          },
        },
      }),
      this.prisma.homework.findMany({
        where: { lesson: { courseId }, isPublished: true },
        include: {
          submissions: {
            where: { studentId: { in: studentIds } },
          },
        },
      }),
      this.prisma.assessment.findMany({
        where: { courseId, isPublished: true },
        include: {
          attempts: {
            where: { studentId: { in: studentIds }, completedAt: { not: null } },
          },
        },
      }),
    ]);

    const totalSessions = attendanceSessions.length;
    const totalHomeworks = homeworks.length;
    const totalAssessments = assessments.length;

    const students = group.enrollments.map((enrollment) => {
      const student = enrollment.student;

      // Attendance: PRESENT + LATE count as attended
      let attendancePresent = 0;
      for (const session of attendanceSessions) {
        const record = session.records.find((r) => r.studentId === student.id);
        if (record && (record.status === "PRESENT" || record.status === "LATE")) {
          attendancePresent++;
        }
      }
      const attendancePercent =
        totalSessions > 0 ? Math.round((attendancePresent / totalSessions) * 100) : 0;

      // Homework: best finalScore (or manualScore if set) per homework
      let homeworkCompleted = 0;
      let homeworkScoreSum = 0;
      for (const hw of homeworks) {
        const studentSubs = hw.submissions.filter((s) => s.studentId === student.id);
        if (studentSubs.length > 0) {
          homeworkCompleted++;
          const bestScore = Math.max(
            ...studentSubs.map((s) => (s.manualScore !== null ? s.manualScore : s.finalScore))
          );
          homeworkScoreSum += bestScore;
        }
      }
      const homeworkAvgScore =
        homeworkCompleted > 0 ? Math.round(homeworkScoreSum / homeworkCompleted) : 0;

      // Exams: best percentage per assessment
      let examsPassed = 0;
      let examScoreSum = 0;
      for (const assess of assessments) {
        const studentAttempts = assess.attempts.filter((a) => a.studentId === student.id);
        if (studentAttempts.length > 0) {
          examsPassed++;
          const bestPct = Math.max(...studentAttempts.map((a) => a.percentage));
          examScoreSum += bestPct;
        }
      }
      const examAvgScore = examsPassed > 0 ? Math.round(examScoreSum / examsPassed) : 0;

      // Overall: attendance 20%, homework 40%, exams 40%
      const overallScore = Math.round(
        attendancePercent * 0.2 + homeworkAvgScore * 0.4 + examAvgScore * 0.4
      );

      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        attendancePercent,
        attendancePresent,
        attendanceTotal: totalSessions,
        homeworkCompleted,
        homeworkTotal: totalHomeworks,
        homeworkAvgScore,
        examsPassed,
        examsTotal: totalAssessments,
        examAvgScore,
        overallScore,
      };
    });

    const avg = (fn: (s: (typeof students)[0]) => number) =>
      students.length > 0
        ? Math.round(students.reduce((sum, s) => sum + fn(s), 0) / students.length)
        : 0;

    return {
      group: { id: group.id, name: group.name, course: group.course },
      summary: {
        totalStudents: students.length,
        avgAttendance: avg((s) => s.attendancePercent),
        avgHomeworkScore: avg((s) => s.homeworkAvgScore),
        avgExamScore: avg((s) => s.examAvgScore),
        totalHomeworks,
        totalAssessments,
        totalSessions,
      },
      students,
    };
  }
}

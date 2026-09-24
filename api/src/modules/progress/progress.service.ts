import { Injectable, NotFoundException } from "@nestjs/common";
import type { ManualReviewStatus, SubmissionStatus } from "../../../generated/prisma";
import type { SessionUser } from "../../common/auth/session-user";
import { toDateInput } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import { activeEnrollmentFilter, enrollmentTeacherFilter } from "../billing/billing-ledger.service";
import { currentMonthKey, isValidMonth, monthEnd, monthStart } from "../billing/domain/billing";

export interface ProgressAttendance {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** (present+late)/total, 0..100; null — занятий в журнале за месяц не было */
  percent: number | null;
  /** Даты пропусков (ABSENT), "YYYY-MM-DD" — web форматирует в DD.MM */
  absentDates: string[];
}

export interface ProgressHomeworkItem {
  id: string;
  slug: string;
  title: string;
  lessonSlug: string;
  dueDate: string | null;
  /** Сдавал ли ученик хотя бы раз */
  submitted: boolean;
  /** Срок прошёл, а сдачи нет вовсе */
  missed: boolean;
  status: SubmissionStatus | null;
  manualStatus: ManualReviewStatus | null;
  /** Проверено — авто (для заданий без ручной проверки) либо преподавателем */
  reviewed: boolean;
  /** Итоговый процент проверенной сдачи; null, пока не проверено */
  percent: number | null;
  teacherComment: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
}

export interface ProgressTestItem {
  assessmentId: string;
  title: string;
  type: "TEST" | "EXAM";
  /** Лучшая из завершённых попыток */
  percent: number;
  completedAt: string;
  attemptsCount: number;
}

export interface ProgressCourse {
  course: { id: string; title: string; slug: string };
  attendance: ProgressAttendance;
  homework: {
    total: number;
    done: number;
    avgPercent: number | null;
    items: ProgressHomeworkItem[];
  };
  tests: {
    items: ProgressTestItem[];
    avgPercent: number | null;
  };
  lessons: { total: number; completed: number };
}

export interface ProgressResponse {
  student: { id: string; firstName: string; lastName: string };
  month: string;
  totals: {
    attendancePercent: number | null;
    homeworkDone: number;
    homeworkTotal: number;
    homeworkAvgPercent: number | null;
    testAvgPercent: number | null;
  };
  courses: ProgressCourse[];
}

/**
 * Успеваемость ребёнка (план PLAN-PARENT-PROGRESS-2026-09-24.md, раздел 1).
 *
 * Доступ по родству/роли решает этот сервис, а не CASL (abilities.ts):
 * правило здесь не «что можно с моделью User», а «сузить до себя / своего
 * ребёнка / ученика своей группы» — то же решение, что у
 * StudentDashboardService и AttendanceService.studentAttendance. Чужого
 * ученика любая роль получает как 404 (studentNotFound), а не 403 — ответ не
 * должен подтверждать, что такой ученик вообще существует (аудит 2.4).
 */
@Injectable()
export class ProgressService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async forStudent(studentId: string, user: SessionUser, monthParam?: string): Promise<ProgressResponse> {
    const month = monthParam && isValidMonth(monthParam) ? monthParam : currentMonthKey();
    const from = monthStart(month);
    const to = monthEnd(month);

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });
    // Роль не STUDENT — не тот id (например, id учителя или родителя):
    // тот же 404, чтобы не отличаться от «просто нет такого пользователя»
    if (!student || student.role !== "STUDENT") throw new NotFoundException("studentNotFound");

    if (user.role === "STUDENT") {
      if (user.id !== studentId) throw new NotFoundException("studentNotFound");
    } else if (user.role === "PARENT") {
      const link = await this.prisma.parentStudent.findUnique({
        where: { parentId_studentId: { parentId: user.id, studentId } },
        select: { id: true },
      });
      if (!link) throw new NotFoundException("studentNotFound");
    } else if (user.role !== "ADMIN" && user.role !== "TEACHER") {
      throw new NotFoundException("studentNotFound");
    }

    // Курсы, которые вправе видеть именно этот вызывающий: у администратора,
    // родителя и самого ученика — все действующие записи ребёнка; у
    // преподавателя — только там, где он ведёт группу или курс целиком
    // (лестница enrollmentTeacherFilter, как в реестре начислений). Курс в
    // Корзине — не показываем (расширение мягкого удаления фильтрует только
    // прямую модель запроса, вложенную связь — руками, как в dashboard.service.ts).
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        ...activeEnrollmentFilter(),
        course: { deletedAt: null },
        ...(user.role === "TEACHER" ? enrollmentTeacherFilter(user.id) : {}),
      },
      select: { courseId: true, course: { select: { id: true, title: true, slug: true } } },
    });

    // Преподаватель без единого совпадения по лестнице — тот же 404, что и
    // непричастный родитель: иначе ответ отличал бы «ученик есть, но не мой»
    // от «ученика нет» по факту НЕ 404, а по пустому списку курсов
    if (user.role === "TEACHER" && enrollments.length === 0) {
      throw new NotFoundException("studentNotFound");
    }

    const courses = [...new Map(enrollments.map((e) => [e.courseId, e.course])).values()];
    const courseIds = courses.map((c) => c.id);

    if (courseIds.length === 0) {
      return {
        student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
        month,
        totals: {
          attendancePercent: null,
          homeworkDone: 0,
          homeworkTotal: 0,
          homeworkAvgPercent: null,
          testAvgPercent: null,
        },
        courses: [],
      };
    }

    const [attendanceRecords, homeworks, assessments, lessons] = await Promise.all([
      // Посещаемость — строго за выбранный месяц (раздел 1 плана); домашние
      // задания, тесты и прогресс по урокам — накопительно за весь курс, как
      // и написано в плане: только у посещаемости есть «за период»
      this.prisma.attendanceRecord.findMany({
        where: { studentId, session: { courseId: { in: courseIds }, date: { gte: from, lte: to } } },
        select: { status: true, session: { select: { courseId: true, date: true } } },
        orderBy: { session: { date: "asc" } },
      }),
      this.prisma.homework.findMany({
        where: { isPublished: true, lesson: { isPublished: true, deletedAt: null, courseId: { in: courseIds } } },
        select: {
          id: true,
          slug: true,
          title: true,
          dueDate: true,
          maxScore: true,
          requiresManualReview: true,
          lesson: { select: { slug: true, courseId: true } },
          // Последняя сдача, как в HomeworkService.forStudentList — не лучшая,
          // а последняя: ученик видит текущий статус своей работы
          submissions: {
            where: { studentId },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
              manualStatus: true,
              percentage: true,
              manualScore: true,
              teacherComment: true,
              reviewedAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
      }),
      this.prisma.assessment.findMany({
        where: { isPublished: true, courseId: { in: courseIds } },
        select: {
          id: true,
          title: true,
          type: true,
          courseId: true,
          attempts: {
            where: { studentId, completedAt: { not: null } },
            select: { percentage: true, completedAt: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.lesson.findMany({
        where: { isPublished: true, courseId: { in: courseIds } },
        select: {
          id: true,
          courseId: true,
          progress: { where: { studentId }, select: { completedAt: true } },
        },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const attendanceByCourse = new Map<string, ProgressAttendance>();
    for (const courseId of courseIds) {
      attendanceByCourse.set(courseId, { total: 0, present: 0, late: 0, absent: 0, excused: 0, percent: null, absentDates: [] });
    }
    for (const record of attendanceRecords) {
      const bucket = attendanceByCourse.get(record.session.courseId);
      if (!bucket) continue;
      bucket.total++;
      if (record.status === "PRESENT") bucket.present++;
      else if (record.status === "LATE") bucket.late++;
      else if (record.status === "EXCUSED") bucket.excused++;
      else if (record.status === "ABSENT") {
        bucket.absent++;
        bucket.absentDates.push(toDateInput(record.session.date));
      }
    }
    for (const bucket of attendanceByCourse.values()) {
      bucket.percent = bucket.total > 0 ? Math.round(((bucket.present + bucket.late) / bucket.total) * 100) : null;
    }

    const now = new Date();
    const homeworkByCourse = new Map<string, ProgressHomeworkItem[]>();
    for (const courseId of courseIds) homeworkByCourse.set(courseId, []);
    for (const homework of homeworks) {
      const bucket = homeworkByCourse.get(homework.lesson.courseId);
      if (!bucket) continue;

      const submission = homework.submissions[0] ?? null;
      const submitted = submission !== null;
      const missed = !submitted && homework.dueDate !== null && homework.dueDate < now;

      let reviewed = false;
      let percent: number | null = null;
      if (submission) {
        reviewed = homework.requiresManualReview
          ? submission.manualStatus !== null && submission.manualStatus !== "PENDING"
          : submission.status !== "PENDING" && submission.status !== "RUNNING";

        if (reviewed) {
          // Ручная оценка перевешивает автопроверку — тот же приоритет, что у
          // SubmissionsService.review (manualScore важнее finalScore). Для
          // задания с ручной проверкой без выставленного балла (например,
          // REVISION — отправлено на доработку, оценки ещё нет) числа нет
          // вовсе: submission.percentage там всегда 0 (автопроверки не было),
          // и попадание нуля в средний процент выглядело бы как «двойка»,
          // хотя оценки не было совсем.
          if (submission.manualScore !== null && homework.maxScore > 0) {
            percent = (submission.manualScore / homework.maxScore) * 100;
          } else if (!homework.requiresManualReview) {
            percent = submission.percentage;
          }
        }
      }

      bucket.push({
        id: homework.id,
        slug: homework.slug,
        title: homework.title,
        lessonSlug: homework.lesson.slug,
        dueDate: homework.dueDate ? toDateInput(homework.dueDate) : null,
        submitted,
        missed,
        status: submission?.status ?? null,
        manualStatus: submission?.manualStatus ?? null,
        reviewed,
        percent: percent === null ? null : Math.round(percent),
        teacherComment: submission?.teacherComment ?? null,
        reviewedAt: submission?.reviewedAt ? submission.reviewedAt.toISOString() : null,
        submittedAt: submission?.createdAt ? submission.createdAt.toISOString() : null,
      });
    }

    const testsByCourse = new Map<string, ProgressTestItem[]>();
    for (const courseId of courseIds) testsByCourse.set(courseId, []);
    for (const assessment of assessments) {
      if (assessment.attempts.length === 0) continue;
      // Лучшая попытка по проценту; при равенстве — более поздняя
      const best = assessment.attempts.reduce((top, attempt) => {
        if (attempt.percentage > top.percentage) return attempt;
        if (attempt.percentage === top.percentage && attempt.completedAt! > top.completedAt!) return attempt;
        return top;
      });
      testsByCourse.get(assessment.courseId)?.push({
        assessmentId: assessment.id,
        title: assessment.title,
        type: assessment.type,
        percent: Math.round(best.percentage),
        completedAt: best.completedAt!.toISOString(),
        attemptsCount: assessment.attempts.length,
      });
    }

    const lessonsByCourse = new Map<string, { total: number; completed: number }>();
    for (const courseId of courseIds) lessonsByCourse.set(courseId, { total: 0, completed: 0 });
    for (const lesson of lessons) {
      const bucket = lessonsByCourse.get(lesson.courseId);
      if (!bucket) continue;
      bucket.total++;
      if (lesson.progress[0]?.completedAt) bucket.completed++;
    }

    const courseResults: ProgressCourse[] = courses.map((course) => {
      const attendance = attendanceByCourse.get(course.id)!;
      const homeworkItems = homeworkByCourse.get(course.id) ?? [];
      const homeworkDone = homeworkItems.filter((item) => item.submitted).length;
      const reviewedPercents = homeworkItems
        .filter((item) => item.reviewed && item.percent !== null)
        .map((item) => item.percent!);
      const homeworkAvgPercent =
        reviewedPercents.length > 0 ? Math.round(average(reviewedPercents)) : null;

      const testItems = testsByCourse.get(course.id) ?? [];
      const testAvgPercent = testItems.length > 0 ? Math.round(average(testItems.map((i) => i.percent))) : null;

      return {
        course,
        attendance,
        homework: { total: homeworkItems.length, done: homeworkDone, avgPercent: homeworkAvgPercent, items: homeworkItems },
        tests: { items: testItems, avgPercent: testAvgPercent },
        lessons: lessonsByCourse.get(course.id)!,
      };
    });

    const attendanceTotals = courseResults.reduce(
      (acc, course) => {
        acc.total += course.attendance.total;
        acc.attended += course.attendance.present + course.attendance.late;
        return acc;
      },
      { total: 0, attended: 0 }
    );

    const allReviewedPercents = courseResults.flatMap((course) =>
      course.homework.items.filter((item) => item.reviewed && item.percent !== null).map((item) => item.percent!)
    );
    const allTestPercents = courseResults.flatMap((course) => course.tests.items.map((item) => item.percent));

    return {
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
      month,
      totals: {
        attendancePercent:
          attendanceTotals.total > 0 ? Math.round((attendanceTotals.attended / attendanceTotals.total) * 100) : null,
        homeworkDone: courseResults.reduce((sum, course) => sum + course.homework.done, 0),
        homeworkTotal: courseResults.reduce((sum, course) => sum + course.homework.total, 0),
        homeworkAvgPercent: allReviewedPercents.length > 0 ? Math.round(average(allReviewedPercents)) : null,
        testAvgPercent: allTestPercents.length > 0 ? Math.round(average(allTestPercents)) : null,
      },
      courses: courseResults,
    };
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

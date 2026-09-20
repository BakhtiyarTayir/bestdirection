import { Injectable } from "@nestjs/common";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { HomeworkStatisticsQueryDto } from "./dto/user.dto";

// Сколько минут после последней активности считаем «сейчас на сайте»
const ONLINE_WINDOW_MINUTES = 5;

// Теги BCP 47 как в web (src/i18n/config.ts): региональный вариант даёт
// правильный порядок сортировки — узбекский ставит Oʻ и Gʻ после Z, русский
// кириллицу перед латиницей
const LOCALE_TAGS: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU" };

type SubmissionState = "ALL" | "PASSED" | "FAILED" | "NOT_SUBMITTED";

const EMPTY_SUMMARY = {
  totalStudents: 0,
  passedCount: 0,
  failedCount: 0,
  notSubmittedCount: 0,
  averageBestPercent: 0,
  onlineNowCount: 0,
};

/** Сводка по сдаче одного домашнего задания: кто сдал, кто нет, кто сейчас на сайте. */
@Injectable()
export class HomeworkStatisticsService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async build(query: HomeworkStatisticsQueryDto, user: SessionUser) {
    // Преподаватель видит статистику только по своим курсам
    const courses = await this.prisma.course.findMany({
      where: user.role === "TEACHER" ? { teacherId: user.id } : {},
      select: { id: true, title: true, slug: true },
      orderBy: { title: "asc" },
    });

    const selectedCourseId =
      query.courseId && courses.some((c) => c.id === query.courseId) ? query.courseId : undefined;

    if (!selectedCourseId) {
      return { courses, homeworks: [], groups: [], summary: EMPTY_SUMMARY, rows: [] };
    }

    const [homeworks, groups] = await Promise.all([
      this.prisma.homework.findMany({
        where: { isPublished: true, lesson: { courseId: selectedCourseId } },
        select: {
          id: true,
          title: true,
          passingScore: true,
          requiresManualReview: true,
          lesson: { select: { title: true } },
        },
        orderBy: [{ lesson: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      }),
      this.prisma.group.findMany({
        where: { courseId: selectedCourseId },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const selectedHomework = query.homeworkId
      ? (homeworks.find((h) => h.id === query.homeworkId) ?? null)
      : null;
    const selectedGroupId =
      query.groupId && groups.some((g) => g.id === query.groupId) ? query.groupId : undefined;
    const selectedState: SubmissionState = query.submissionState ?? "ALL";

    if (!selectedHomework) {
      return { courses, homeworks, groups, summary: EMPTY_SUMMARY, rows: [] };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId: selectedCourseId,
        // deletedAt явно: расширение мягкого удаления фильтрует саму модель
        // запроса, а не вложенные связи
        student: { isActive: true, deletedAt: null },
        ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, login: true, isActive: true, lastSeenAt: true },
        },
        group: { select: { id: true, name: true } },
      },
    });

    const studentIds = enrollments.map((e) => e.student.id);
    const submissions = studentIds.length
      ? await this.prisma.submission.findMany({
          where: { homeworkId: selectedHomework.id, studentId: { in: studentIds } },
          select: {
            id: true,
            studentId: true,
            status: true,
            percentage: true,
            finalScore: true,
            manualStatus: true,
            manualScore: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const byStudent = new Map<string, typeof submissions>();
    for (const submission of submissions) {
      const list = byStudent.get(submission.studentId) ?? [];
      list.push(submission);
      byStudent.set(submission.studentId, list);
    }

    const onlineThreshold = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000);

    const rows = enrollments.map((enrollment) => {
      const studentSubs = byStudent.get(enrollment.student.id) ?? [];
      const hasSubmission = studentSubs.length > 0;
      const isOnlineNow =
        enrollment.student.isActive &&
        enrollment.student.lastSeenAt !== null &&
        enrollment.student.lastSeenAt >= onlineThreshold;

      // Ручная оценка преподавателя важнее автоматической
      const bestPercent = hasSubmission
        ? Math.round(
            Math.max(
              ...studentSubs.map((s) => Number(s.manualScore !== null ? s.manualScore : s.finalScore))
            )
          )
        : 0;

      const hasManualApproved = studentSubs.some((s) => s.manualStatus === "APPROVED");
      const hasAutoPassed = studentSubs.some(
        (s) =>
          s.status === "PASSED" ||
          Number(s.manualScore !== null ? s.manualScore : s.finalScore) >= selectedHomework.passingScore
      );
      const isPassed = hasSubmission
        ? selectedHomework.requiresManualReview
          ? hasManualApproved
          : hasManualApproved || hasAutoPassed
        : false;

      const submissionState: Exclude<SubmissionState, "ALL"> = !hasSubmission
        ? "NOT_SUBMITTED"
        : isPassed
          ? "PASSED"
          : "FAILED";

      const lastSubmittedAt = hasSubmission
        ? studentSubs.reduce(
            (latest, current) => (current.createdAt > latest ? current.createdAt : latest),
            studentSubs[0].createdAt
          )
        : null;

      return {
        studentId: enrollment.student.id,
        fullName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        login: enrollment.student.login,
        isActive: enrollment.student.isActive,
        isOnlineNow,
        groupId: enrollment.group?.id ?? null,
        groupName: enrollment.group?.name ?? null,
        attempts: studentSubs.length,
        bestPercent,
        submissionState,
        hasSubmission,
        lastSubmittedAt,
      };
    });

    const submitted = rows.filter((r) => r.hasSubmission);
    const summary = {
      totalStudents: rows.length,
      passedCount: rows.filter((r) => r.submissionState === "PASSED").length,
      failedCount: rows.filter((r) => r.submissionState === "FAILED").length,
      notSubmittedCount: rows.filter((r) => r.submissionState === "NOT_SUBMITTED").length,
      onlineNowCount: rows.filter((r) => r.isOnlineNow).length,
      averageBestPercent: submitted.length
        ? Math.round(submitted.reduce((sum, r) => sum + r.bestPercent, 0) / submitted.length)
        : 0,
    };

    const filteredRows = selectedState === "ALL" ? rows : rows.filter((r) => r.submissionState === selectedState);

    // Несдавшие — в конец, остальные по убыванию результата, затем по алфавиту
    const collator = new Intl.Collator(LOCALE_TAGS[query.locale] ?? LOCALE_TAGS.uz, { sensitivity: "base" });
    filteredRows.sort((a, b) => {
      if (a.submissionState === "NOT_SUBMITTED" && b.submissionState !== "NOT_SUBMITTED") return 1;
      if (a.submissionState !== "NOT_SUBMITTED" && b.submissionState === "NOT_SUBMITTED") return -1;
      if (b.bestPercent !== a.bestPercent) return b.bestPercent - a.bestPercent;
      return collator.compare(a.fullName, b.fullName);
    });

    return { courses, homeworks, groups, summary, rows: filteredRows };
  }
}

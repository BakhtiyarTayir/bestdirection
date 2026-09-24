import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TelegramNotifyService } from "../../common/telegram/telegram-notify.service";
import { BillingService } from "../billing/billing.service";
import { toDdMm } from "../dashboard/teacher-dashboard.service";
import { buildWeeklyDigestText } from "./domain/weekly-digest-text";
import { previousWeek, weekDateRange, type WeekBounds } from "./domain/week";

type ReviewedStatus = "APPROVED" | "REJECTED" | "REVISION";

/**
 * Еженедельная сводка родителям (план, 2.3): каждый понедельник в 09:00 по
 * Ташкенту (04:00 UTC) — по каждому ребёнку за прошедшую неделю посещаемость,
 * проверенные задания, пройденные тесты и долг по оплате.
 *
 * Долг считаем через BillingService.studentBilling — ровно то правило,
 * что и в кабинете, вместо второй копии расчёта здесь (план, «через
 * BillingService.studentBilling, не считать своим кодом»).
 */
@Injectable()
export class WeeklyDigestService {
  private readonly logger = new Logger(WeeklyDigestService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly telegram: TelegramNotifyService,
    private readonly billing: BillingService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  // Выражение "0 4 * * 1" — понедельник 04:00 UTC = 09:00 Ташкент (школа
  // не переходит на летнее время, смещение фиксированное — SCHOOL_UTC_OFFSET_HOURS).
  // timeZone задан явно: сервер контейнера не обязательно живёт в UTC.
  @Cron("0 4 * * 1", { timeZone: "UTC", name: "parent-weekly-digest" })
  async handleCron() {
    await this.run();
  }

  /**
   * Отделено от handleCron: тест зовёт run() напрямую (план, «сама отправка
   * по расписанию — вызов метода сводки напрямую в тесте»), не дожидаясь
   * реального понедельника.
   */
  async run(now: Date = new Date()): Promise<{ sent: number; skipped: "off" | "already-sent" | null }> {
    // Выключатель для эксплуатации: если сводка ведёт себя не так, как
    // ожидалось, её можно заглушить без деплоя — переменной окружения.
    if (process.env.PARENT_WEEKLY_DIGEST === "off") {
      this.logger.log("Еженедельная сводка выключена (PARENT_WEEKLY_DIGEST=off)");
      return { sent: 0, skipped: "off" };
    }

    const week = previousWeek(now);
    const claimed = await this.claimWeek(week.weekKey);
    if (!claimed) {
      this.logger.log(`Сводка за неделю ${week.weekKey} уже отправлена — пропуск (повторный запуск того же окна)`);
      return { sent: 0, skipped: "already-sent" };
    }

    const parents = await this.prisma.user.findMany({
      where: {
        role: "PARENT",
        telegramChatId: { not: null },
        parentProgressNotifications: true,
        childLinks: { some: {} },
      },
      select: {
        telegramChatId: true,
        childLinks: {
          select: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    let sent = 0;
    for (const parent of parents) {
      if (!parent.telegramChatId) continue; // отфильтровано в where, но Prisma не сужает тип
      for (const link of parent.childLinks) {
        try {
          const text = await this.buildDigestFor(link.student, week);
          await this.telegram.send(parent.telegramChatId, text);
          sent++;
        } catch (error) {
          // Один упавший ребёнок/родитель не должен оборвать рассылку остальным
          this.logger.warn(
            `Не удалось собрать сводку для ученика ${link.student.id}: ${String(error)}`
          );
        }
      }
    }

    this.logger.log(`Еженедельная сводка за неделю ${week.weekKey}: отправлено ${sent}`);
    return { sent, skipped: null };
  }

  /**
   * Атомарный захват недели: create() на уникальном weekKey — если строка уже
   * есть, Postgres вернёт P2002, и это ровно сигнал «уже отправляли». Проверка
   * «есть ли уже запись» отдельным SELECT перед созданием была бы гонкой при
   * одновременном старте двух процессов — уникальный индекс её исключает.
   */
  private async claimWeek(weekKey: string): Promise<boolean> {
    try {
      await this.prisma.weeklyDigestRun.create({ data: { weekKey } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }

  private async buildDigestFor(
    student: { id: string; firstName: string; lastName: string },
    week: WeekBounds
  ): Promise<string> {
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const dateRange = weekDateRange(week);

    const [attendanceRecords, reviewedSubmissions, testAttempts, billing] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { studentId: student.id, session: { date: dateRange, course: { deletedAt: null } } },
        select: { status: true },
      }),
      // Мягкое удаление скрывает Course/Lesson только у прямого запроса модели
      // — вложенные связи (homework.lesson, homework.lesson.course) фильтруем
      // руками, как и везде в проекте (аудит, dashboard.service.ts)
      this.prisma.submission.findMany({
        where: {
          studentId: student.id,
          manualStatus: { in: ["APPROVED", "REJECTED", "REVISION"] },
          reviewedAt: { gte: week.fromInstant, lt: week.toInstantExclusive },
          homework: { lesson: { deletedAt: null, course: { deletedAt: null } } },
        },
        select: { manualStatus: true, manualScore: true, homework: { select: { title: true, maxScore: true } } },
        orderBy: { reviewedAt: "asc" },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: {
          studentId: student.id,
          completedAt: { gte: week.fromInstant, lt: week.toInstantExclusive },
          assessment: {
            course: { deletedAt: null },
            OR: [{ lessonId: null }, { lesson: { deletedAt: null } }],
          },
        },
        select: { percentage: true, assessment: { select: { title: true } } },
        orderBy: { completedAt: "asc" },
      }),
      this.billing.studentBilling(student.id).catch((error) => {
        this.logger.warn(`studentBilling упал для ученика ${student.id}: ${String(error)}`);
        return null;
      }),
    ]);

    const attendanceTotal = attendanceRecords.length;
    const attendanceAbsent = attendanceRecords.filter((record) => record.status === "ABSENT").length;

    const homework = reviewedSubmissions.map((submission) => ({
      title: submission.homework.title,
      // manualStatus в выборке ограничен where — PENDING сюда не попадает
      status: submission.manualStatus as ReviewedStatus,
      score: submission.manualScore != null ? `${submission.manualScore}/${submission.homework.maxScore}` : null,
    }));

    const tests = testAttempts.map((attempt) => ({
      title: attempt.assessment.title,
      percentage: Math.round(attempt.percentage),
    }));

    // balance = оплачено - начислено: отрицательный — долг (billing.service.ts, studentBilling)
    const debtAmount = billing ? Math.max(0, -billing.totals.balance) : 0;

    return buildWeeklyDigestText({
      studentName,
      weekFromDdMm: toDdMm(week.fromDateKey),
      weekToDdMm: toDdMm(week.toDateKey),
      attendanceTotal,
      attendanceAbsent,
      homework,
      tests,
      debtAmount,
      debtAmountFormatted: `${new Intl.NumberFormat("uz-UZ").format(debtAmount)} UZS`,
    });
  }
}

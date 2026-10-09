import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Prisma } from "../../../generated/prisma";
import { BillingLedgerService, type LoadedEnrollment } from "../billing/billing-ledger.service";
import {
  addMonths,
  computeFormulaAmount,
  computeMonthLessonMarks,
  currentMonthKey,
  isClosedMonth,
  isValidMonth,
  markMakeupSessions,
  mergeAccrualMonths,
  monthEnd,
  monthKey,
  monthStart,
  payoutMonth,
  resolveSalaryPercentBp,
  splitAccrualByTeacher,
  totalAccrued,
  type MarkedSession,
  type MonthAccrual,
  type MonthLessonMarks,
} from "./domain/salary";
import type { RecalcQueryDto, SalaryOverviewQueryDto, TeacherSalaryQueryDto } from "./dto/salary.dto";

/**
 * Единица начисления: преподаватель + группа, либо преподаватель + курс без
 * группы (groupId пуст). У группы с раскладкой по занятиям (этап 3) единиц
 * может быть НЕСКОЛЬКО на одну группу: владелец (group.teacherId ?? course.
 * teacherId) и любой, кто хоть раз явно записан ведущим занятия этой группы
 * (замена) — loadUnits() находит их по AttendanceSession.teacherId.
 */
interface Unit {
  /** Получатель строки начисления: обычно владелец, для найденных замен — фактический ведущий */
  teacherId: string;
  teacherName: string;
  /**
   * Ставка, по которой считается ВСЯ сумма группы за месяц (решение
   * владельца 2026-09-21, раздел 0: заменяющему платят по ставке группы, а
   * не по своей). Поэтому здесь всегда личный процент ВЛАДЕЛЬЦА группы —
   * для строки владельца и для строки замены он один и тот же.
   */
  teacherPercentBp: number | null;
  courseId: string;
  courseTitle: string;
  groupId: string | null;
  groupName: string | null;
  branchId: string | null;
  groupPercentBp: number | null;
  /** Владелец группы (group.teacherId ?? course.teacherId) — для сравнения teacherId === ownerTeacherId */
  ownerTeacherId: string;
  /** Дни занятий группы. [] у курса без группы — раскладка по занятиям для него невозможна */
  scheduleDays: number[];
}

/**
 * Фильтр единиц начисления. groupId различает «не фильтровать по группе»
 * (undefined) и «только записи БЕЗ группы» (null) — это нужно точечной
 * заморозке при переводе/отчислении ученика (freezeClosedMonths).
 */
interface UnitFilters {
  groupId?: string | null;
  courseId?: string;
  teacherId?: string;
  branchId?: string;
}

/**
 * Начисления зарплаты преподавателям и их долг перед центром. Модуль
 * переиспользует BillingLedgerService: база берётся из уже посчитанных и
 * замороженных начислений учеников (MonthlyCharge), сама зарплата не трогает
 * биллинг учеников напрямую.
 *
 * Порядок расчёта (план зарплат, 5.6): сначала BillingLedgerService
 * замораживает закрытые месяцы учеников, и только потом считается зарплата —
 * иначе база взялась бы из ещё не зафиксированных данных.
 */
@Injectable()
export class SalaryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly ledger: BillingLedgerService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Единицы начисления: все группы (кроме курсов в Корзине) и курсы, у
   * которых есть записи без группы. Педагог единицы определяется той же
   * лестницей, что и в посещаемости (attendance-access.ts): педагог группы →
   * педагог курса.
   *
   * Без фильтра мягкого удаления для преподавателя: закрытый месяц удалённого
   * (уволенного) преподавателя не должен пропасть из отчёта без имени — тот
   * же приём, что в teacher-attendance.service.ts.
   */
  private async loadUnits(filters: UnitFilters = {}): Promise<Unit[]> {
    // groupId различает три случая: undefined — без фильтра по группе,
    // null — только единицы БЕЗ группы, строка — одна конкретная группа
    const wantsUngroupedOnly = filters.groupId === null;
    const wantsSpecificGroup = typeof filters.groupId === "string";

    const groups = wantsUngroupedOnly
      ? []
      : await this.prisma.group.findMany({
          where: {
            course: { deletedAt: null },
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
            ...(wantsSpecificGroup ? { id: filters.groupId as string } : {}),
            ...(filters.courseId ? { courseId: filters.courseId } : {}),
          },
          select: {
            id: true,
            name: true,
            branchId: true,
            salaryPercentBp: true,
            teacherId: true,
            scheduleDays: true,
            course: { select: { id: true, title: true, teacherId: true } },
          },
        });

    // Замены: кто ещё явно записан ведущим занятия этой группы, кроме
    // владельца (этап 3, план 4.3–4.6). Один запрос на все группы разом —
    // групп мало (14 активных на момент планирования), а без него
    // unitSchedule ниже не узнал бы, кому ещё положена своя строка.
    const groupIds = groups.map((group) => group.id);
    const substituteRows =
      groupIds.length > 0
        ? await this.prisma.attendanceSession.groupBy({
            by: ["groupId", "teacherId"],
            where: { groupId: { in: groupIds }, teacherId: { not: null } },
          })
        : [];
    const substitutesByGroup = new Map<string, Set<string>>();
    for (const row of substituteRows) {
      if (!row.groupId || !row.teacherId) continue;
      const group = groups.find((g) => g.id === row.groupId);
      const ownerTeacherId = group?.teacherId ?? group?.course.teacherId;
      if (!group || row.teacherId === ownerTeacherId) continue; // тот же человек — не замена
      const set = substitutesByGroup.get(row.groupId) ?? new Set<string>();
      set.add(row.teacherId);
      substitutesByGroup.set(row.groupId, set);
    }

    const groupUnits: Omit<Unit, "teacherName" | "teacherPercentBp">[] = [];
    for (const group of groups) {
      const ownerTeacherId = group.teacherId ?? group.course.teacherId;
      const shared = {
        courseId: group.course.id,
        courseTitle: group.course.title,
        groupId: group.id,
        groupName: group.name,
        branchId: group.branchId,
        groupPercentBp: group.salaryPercentBp,
        ownerTeacherId,
        scheduleDays: group.scheduleDays,
      };
      groupUnits.push({ teacherId: ownerTeacherId, ...shared });
      for (const substituteId of substitutesByGroup.get(group.id) ?? []) {
        groupUnits.push({ teacherId: substituteId, ...shared });
      }
    }

    // Курсы с записями без группы. Снимка филиала у них нет (ловушка
    // withoutGroup — см. LedgerFilters в billing-ledger.service.ts): при
    // заданном фильтре по филиалу такие записи не попадают в список, сузить
    // их по филиалу нечем. У курса нет расписания — раскладка по занятиям
    // для таких записей невозможна в принципе (scheduleDays: [])
    const ungroupedCourses =
      filters.branchId || wantsSpecificGroup
        ? []
        : await this.prisma.course.findMany({
            where: {
              deletedAt: null,
              // Отчисленная (unenrolledAt) запись сюда не считается: её
              // вклад в базу уже заморожен под тем юнитом, где она реально
              // была (freezeClosedMonths вызывается ДО отчисления), а
              // дальше начисление всё равно ноль. Без этого условия
              // отчисление порождало бы «призрачный» безгрупповой юнит с
              // нулевой суммой, который потом сталкивается с настоящим
              // безгрупповым юнитом на уникальном индексе при удалении
              // группы (SetNull каскадит groupId у TeacherSalaryAccrual).
              enrollments: { some: { groupId: null, unenrolledAt: null } },
              ...(filters.courseId ? { id: filters.courseId } : {}),
            },
            select: { id: true, title: true, teacherId: true },
          });

    const courseUnits = ungroupedCourses.map((course) => ({
      teacherId: course.teacherId,
      courseId: course.id,
      courseTitle: course.title,
      groupId: null as string | null,
      groupName: null as string | null,
      branchId: null as string | null,
      groupPercentBp: null as number | null,
      ownerTeacherId: course.teacherId,
      scheduleDays: [] as number[],
    }));

    // Единицы из истории: у кого уже есть замороженные строки, даже если
    // сейчас он группу не ведёт. Без этого смена педагога группы стирала
    // прежнему педагогу его закрытые месяцы со страницы зарплаты и из
    // сводки, хотя деньги за них он заработал. Педагог, ставка и расписание
    // берутся текущие — они нужны только открытым месяцам, а открытый месяц
    // бывшему педагогу достаётся лишь по отметкам в журнале.
    // Курсы в Корзине здесь не отсеиваются: заработанное по ним уже
    // заморожено, и удаление курса не должно стирать его из долга центра
    const historicalRows = await this.prisma.teacherSalaryAccrual.findMany({
      where: {
        ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(wantsUngroupedOnly ? { groupId: null } : {}),
        ...(wantsSpecificGroup ? { groupId: filters.groupId as string } : {}),
      },
      distinct: ["teacherId", "courseId", "groupId"],
      select: {
        teacherId: true,
        courseId: true,
        groupId: true,
        branchId: true,
        course: { select: { title: true, teacherId: true } },
        group: { select: { name: true, branchId: true, salaryPercentBp: true, teacherId: true, scheduleDays: true } },
      },
    });
    const unitKey = (unit: { teacherId: string; courseId: string; groupId: string | null }) =>
      `${unit.teacherId}|${unit.courseId}|${unit.groupId ?? ""}`;
    const knownKeys = new Set([...groupUnits, ...courseUnits].map(unitKey));
    const historicalUnits = historicalRows
      .filter((row) => !knownKeys.has(unitKey(row)))
      .map((row) => ({
        teacherId: row.teacherId,
        courseId: row.courseId,
        courseTitle: row.course.title,
        groupId: row.groupId,
        groupName: row.group?.name ?? null,
        branchId: row.group?.branchId ?? row.branchId,
        groupPercentBp: row.group?.salaryPercentBp ?? null,
        ownerTeacherId: row.group?.teacherId ?? row.course.teacherId,
        scheduleDays: row.group?.scheduleDays ?? [],
      }));

    const raw = [...groupUnits, ...courseUnits, ...historicalUnits].filter(
      (unit) => !filters.teacherId || unit.teacherId === filters.teacherId
    );
    if (raw.length === 0) return [];

    // Личный процент нужен и получателю строки, и (для замен) владельцу —
    // ставка группы считается по владельцу, даже если строка не его
    const teacherIds = [...new Set(raw.flatMap((unit) => [unit.teacherId, unit.ownerTeacherId]))];
    const teachers = await this.prismaService.prismaUnscoped.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true, salaryPercentBp: true },
    });
    const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));

    return raw.map((unit) => {
      const teacher = teacherById.get(unit.teacherId);
      const owner = teacherById.get(unit.ownerTeacherId);
      return {
        ...unit,
        teacherName: teacher ? `${teacher.lastName} ${teacher.firstName}` : "",
        // Ставка группы = ставка группы ?? ЛИЧНАЯ ставка ВЛАДЕЛЬЦА — даже
        // для строки замены (план, раздел 0)
        teacherPercentBp: owner?.salaryPercentBp ?? null,
      };
    });
  }

  /** Записи на курс, входящие в единицу: по группе или (для groupId=null) по курсу без группы. */
  private async loadUnitEnrollments(unit: Pick<Unit, "groupId" | "courseId">): Promise<LoadedEnrollment[]> {
    if (unit.groupId) {
      return this.ledger.loadBillableEnrollments({ groupId: unit.groupId });
    }
    const enrollments = await this.ledger.loadBillableEnrollments({ courseId: unit.courseId });
    // Отчисленная (unenrolledAt) сюда тоже не входит — см. комментарий у
    // ungroupedCourses выше: её база уже зафиксирована под прежним юнитом,
    // а дальше она всё равно не растёт.
    return enrollments.filter((enrollment) => enrollment.group === null && enrollment.unenrolledAt === null);
  }

  /**
   * Расписание начислений одной единицы по месяцам с учётом реестра
   * TeacherSalaryAccrual — прямой аналог BillingLedgerService.resolveSchedules,
   * только база агрегируется по всем ученикам единицы, а не по одной записи.
   *
   * Закрытый месяц без строки фиксируется тут же (ленивая заморозка, как у
   * начислений учеников): повторные и параллельные вызовы безопасны —
   * уникальный индекс (teacherId, courseId, groupId, month) плюс частичный
   * индекс для groupId IS NULL, оба плюс skipDuplicates.
   */
  /**
   * Записи журнала посещаемости группы за перечисленные месяцы, превращённые
   * в отметки для раскладки (этап 3 плана, 4.3). Один запрос на все месяцы
   * сразу — за весь диапазон дат, потом раскладывается по месяцам локально.
   */
  private async loadLessonMarks(
    groupId: string,
    scheduleDays: number[],
    ownerTeacherId: string,
    months: string[]
  ): Promise<Map<string, MonthLessonMarks>> {
    const result = new Map<string, MonthLessonMarks>();
    if (months.length === 0) return result;

    const sortedMonths = [...months].sort();
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { groupId, date: { gte: monthStart(sortedMonths[0]), lte: monthEnd(sortedMonths[sortedMonths.length - 1]) } },
      select: { date: true, teacherId: true, teacherStatus: true },
    });

    const byMonth = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const month = monthKey(session.date);
      const list = byMonth.get(month) ?? [];
      list.push(session);
      byMonth.set(month, list);
    }

    for (const month of months) {
      const monthSessions = byMonth.get(month) ?? [];
      result.set(
        month,
        computeMonthLessonMarks(
          scheduleDays,
          monthStart(month),
          monthEnd(month),
          monthSessions.map((session) => ({
            date: session.date,
            teacherStatus: session.teacherStatus,
            // Ведущий не записан явно — числится за владельцем группы (та
            // же лестница, что в attendance-access.ts, упрощённая: у группы
            // ведущий уже известен на уровне unit.ownerTeacherId)
            responsibleTeacherId: session.teacherId ?? ownerTeacherId,
          }))
        )
      );
    }

    return result;
  }

  /**
   * База закрытых месяцев единицы — по СНИМКУ группы в MonthlyCharge, а не
   * по нынешнему составу. Ученик, переведённый в октябре, в сентябре учился
   * в прежней группе: его сентябрь принадлежит её базе, и в базу новой
   * группы он попасть не должен, иначе его оплачивают дважды.
   *
   * Удалённые ученики отсеиваются так же, как в
   * BillingLedgerService.loadBillableEnrollments, а курсы в Корзине — нет:
   * замороженные начисления по ним остаются.
   */
  private async snapshotBase(
    unit: Pick<Unit, "courseId" | "groupId">,
    month: Prisma.StringFilter | string
  ): Promise<Map<string, { base: number; studentsCount: number }>> {
    const rows = await this.prisma.monthlyCharge.findMany({
      where: {
        month,
        lockedAt: { not: null },
        groupId: unit.groupId,
        enrollment: { courseId: unit.courseId, student: { deletedAt: null } },
      },
      select: { month: true, amount: true },
    });

    const totals = new Map<string, { base: number; studentsCount: number }>();
    for (const row of rows) {
      const entry = totals.get(row.month) ?? { base: 0, studentsCount: 0 };
      entry.base += row.amount;
      if (row.amount > 0) entry.studentsCount += 1;
      totals.set(row.month, entry);
    }
    return totals;
  }

  /**
   * Замораживает закрытые месяцы ГРУППЫ (или курса без группы) целиком —
   * сразу все строки месяца: владельцу и каждому, кто вёл занятия.
   *
   * Месяц, у которого есть хоть одна строка, уже закрыт для всех: новые
   * строки в него не добавляются. Именно это не даёт новому педагогу группы
   * получить начисления за месяцы, которые вёл и уже получил прежний, — а
   * раньше заморозка шла по единицам, и у нового педагога «своих» строк за
   * прошлое не было, поэтому они создавались заново. Замена, отмеченная в
   * журнале задним числом, тоже не заводит строку в закрытом месяце — это
   * правка через явный пересчёт, как и любая другая.
   *
   * Параллельные вызовы безопасны: оба посчитают одинаковые строки, дубли
   * отсечёт уникальный индекс со skipDuplicates.
   */
  private async freezeGroupClosedMonths(unit: Unit, upToMonth: string, now: Date): Promise<void> {
    const lastClosedMonth = addMonths(currentMonthKey(now), -1);
    const limit = upToMonth < lastClosedMonth ? upToMonth : lastClosedMonth;

    const totals = await this.snapshotBase(unit, { lte: limit });
    // Месяц без денег зарплаты не даёт — строк за него не заводим
    const candidates = [...totals.entries()].filter(([, entry]) => entry.base > 0).map(([month]) => month);
    if (candidates.length === 0) return;

    const sealed = await this.prisma.teacherSalaryAccrual.findMany({
      where: { courseId: unit.courseId, groupId: unit.groupId, month: { in: candidates } },
      select: { month: true },
      distinct: ["month"],
    });
    const sealedMonths = new Set(sealed.map((row) => row.month));
    const months = candidates.filter((month) => !sealedMonths.has(month));
    if (months.length === 0) return;

    const marksByMonth =
      unit.groupId && unit.scheduleDays.length > 0
        ? await this.loadLessonMarks(unit.groupId, unit.scheduleDays, unit.ownerTeacherId, months)
        : new Map<string, MonthLessonMarks>();

    const data: Prisma.TeacherSalaryAccrualCreateManyInput[] = [];
    for (const month of months) {
      const { base, studentsCount } = totals.get(month)!;
      // Ставка группы ?? личная ставка ВЛАДЕЛЬЦА — одна на всех, кто вёл
      const percentUsed = resolveSalaryPercentBp({
        groupPercentBp: unit.groupPercentBp,
        teacherPercentBp: unit.teacherPercentBp,
      });
      const potAmount = computeFormulaAmount(base, percentUsed);
      const shared = {
        courseId: unit.courseId,
        groupId: unit.groupId,
        branchId: unit.branchId,
        month,
        base,
        studentsCount,
        percentUsed,
        lockedAt: now,
      };

      const marks = marksByMonth.get(month);
      if (!marks || marks.fallback) {
        // Запасной путь (4.5): отметок нет — вся сумма владельцу
        data.push({
          ...shared,
          teacherId: unit.ownerTeacherId,
          isOwner: true,
          amount: potAmount,
          lessonsPlanned: null,
          lessonsTaught: null,
        });
        continue;
      }

      const shares = splitAccrualByTeacher(potAmount, marks.lessonsPlanned, marks.taughtByTeacher);
      for (const share of shares) {
        data.push({
          ...shared,
          teacherId: share.teacherId,
          isOwner: share.teacherId === unit.ownerTeacherId,
          amount: share.amount,
          lessonsPlanned: marks.lessonsPlanned,
          lessonsTaught: share.lessonsTaught,
        });
      }
      // Владелец, не проведший в месяце ни одного занятия, всё равно
      // получает строку с нулём — как и раньше: видно, что месяц его и
      // что он пропущен, а не забыт
      if (!shares.some((share) => share.teacherId === unit.ownerTeacherId)) {
        data.push({
          ...shared,
          teacherId: unit.ownerTeacherId,
          isOwner: true,
          amount: 0,
          lessonsPlanned: marks.lessonsPlanned,
          lessonsTaught: 0,
        });
      }
    }

    await this.prisma.teacherSalaryAccrual.createMany({ data, skipDuplicates: true });
  }

  /**
   * Расписание начислений одной единицы по месяцам с учётом реестра
   * TeacherSalaryAccrual.
   *
   * Закрытые месяцы — только из реестра: перед чтением группа замораживается
   * целиком (freezeGroupClosedMonths) по снимку групп в MonthlyCharge.
   * Открытые месяцы считаются формулой по нынешнему составу группы — для
   * них нынешний состав и есть правильный.
   *
   * С этапа 3 сумма месяца может делиться между несколькими единицами одной
   * группы (владелец + замены, см. loadUnits) по числу проведённых занятий —
   * marksByMonth в возврате несёт «отмечено N из M» для интерфейса (этап 2),
   * отдельно от самих сумм.
   */
  private async unitSchedule(
    unit: Unit,
    upToMonth: string
  ): Promise<{ months: MonthAccrual[]; marksByMonth: Map<string, MonthLessonMarks> }> {
    const now = new Date();
    const enrollments = await this.loadUnitEnrollments(unit);
    // Сначала биллинг: закрытые месяцы нынешних учеников фиксируются вместе
    // со снимком группы, и только потом по этому снимку считается зарплата
    // (план зарплат, 5.6)
    const schedules = await this.ledger.resolveSchedules(enrollments, upToMonth);
    await this.freezeGroupClosedMonths(unit, upToMonth, now);

    const monthTotals = new Map<string, { base: number; studentsCount: number }>();
    for (const enrollment of enrollments) {
      for (const item of schedules.get(enrollment.id) ?? []) {
        if (isClosedMonth(item.month, now)) continue;
        const totals = monthTotals.get(item.month) ?? { base: 0, studentsCount: 0 };
        totals.base += item.charge.amount;
        // Считаются ученики, за которых в этом месяце что-то начислено —
        // те же, за кого преподаватель получает процент
        if (item.charge.amount > 0) totals.studentsCount += 1;
        monthTotals.set(item.month, totals);
      }
    }

    const storedRows = await this.prisma.teacherSalaryAccrual.findMany({
      where: { teacherId: unit.teacherId, courseId: unit.courseId, groupId: unit.groupId, month: { lte: upToMonth } },
      select: {
        month: true,
        base: true,
        studentsCount: true,
        percentUsed: true,
        amount: true,
        manualAmount: true,
        lessonsPlanned: true,
        lessonsTaught: true,
      },
    });

    // Раскладка по занятиям возможна только у группы с расписанием — у курса
    // без группы (scheduleDays: []) плана занятий нет, считать не на чем:
    // там всегда старая логика — вся сумма целиком владельцу (запасной путь)
    const allMonths = [...new Set([...monthTotals.keys(), ...storedRows.map((row) => row.month)])];
    const marksByMonth =
      unit.groupId && unit.scheduleDays.length > 0
        ? await this.loadLessonMarks(unit.groupId, unit.scheduleDays, unit.ownerTeacherId, allMonths)
        : new Map<string, MonthLessonMarks>();

    const computed = [...monthTotals.keys()]
      .map((month) => {
        const totals = monthTotals.get(month)!;
        const baseInput = {
          base: totals.base,
          studentsCount: totals.studentsCount,
          groupPercentBp: unit.groupPercentBp,
          teacherPercentBp: unit.teacherPercentBp,
          manualAmount: null,
        };

        const marks = marksByMonth.get(month);
        if (!marks || marks.fallback) {
          // Запасной путь (4.5): нет расписания или ни одной отметки за
          // месяц — вся сумма достаётся владельцу, замены не выделяются.
          // Единица-замена в этот месяц ничего не получает: обнаружить, кто
          // подменял, можно только по отметкам, а их и нет.
          return unit.teacherId === unit.ownerTeacherId ? { month, input: baseInput } : null;
        }

        const potPercentUsed = resolveSalaryPercentBp(baseInput);
        const potAmount = computeFormulaAmount(totals.base, potPercentUsed);
        const share = splitAccrualByTeacher(potAmount, marks.lessonsPlanned, marks.taughtByTeacher).find(
          (item) => item.teacherId === unit.teacherId
        );

        // Замена, ни разу не проводившая занятие в этом конкретном месяце
        // (обнаружена по другому месяцу той же группы) — строки за этот
        // месяц у неё нет вовсе, а не строка с нулём: иначе список месяцев
        // замены раздулся бы пустыми записями на каждый месяц группы
        if (!share && unit.teacherId !== unit.ownerTeacherId) return null;

        return {
          month,
          input: {
            ...baseInput,
            lessons: { planned: marks.lessonsPlanned, taught: share?.lessonsTaught ?? 0, amountOverride: share?.amount ?? 0 },
          },
        };
      })
      .filter((item): item is { month: string; input: NonNullable<typeof item>["input"] } => item !== null);

    const months = mergeAccrualMonths(computed, storedRows, now);
    return { months, marksByMonth };
  }

  /**
   * Фиксирует закрытые месяцы затронутых начислений ПЕРЕД изменением входов
   * расчёта — педагога/цены/расписания/процента группы, перевода или
   * отчисления ученика, смены процента преподавателя.
   *
   * Вызывается СТРОГО ПОСЛЕ BillingLedgerService.freezeClosedMonths в том же
   * месте: зарплата опирается на уже зафиксированные начисления учеников
   * (план зарплат, 5.4). Идемпотентно — уже замороженные месяцы не трогаются.
   */
  async freezeClosedMonths(filters: UnitFilters): Promise<void> {
    const units = await this.loadUnits(filters);
    if (units.length === 0) return;

    // Последний закрытый месяц — предыдущий: текущий ещё открыт
    const lastClosedMonth = addMonths(currentMonthKey(), -1);
    for (const unit of units) {
      await this.unitSchedule(unit, lastClosedMonth);
    }
  }

  /**
   * Начисленная зарплата по месяцам и преподавателям — для отчёта «Финансы».
   * Тот же расчёт, что в сводке (unitSchedule: закрытые месяцы из реестра,
   * открытый — по формуле), только без выплат и без свёртки в одну строку
   * на преподавателя: отчёту нужны суммы за каждый месяц.
   */
  async accrualsByMonth(filters: { branchId?: string }, upToMonth: string) {
    const units = await this.loadUnits({ branchId: filters.branchId });
    const schedules = await Promise.all(units.map((unit) => this.unitSchedule(unit, upToMonth)));

    const rows: { teacherId: string; teacherName: string; month: string; amount: number }[] = [];
    units.forEach((unit, index) => {
      for (const item of schedules[index].months) {
        rows.push({ teacherId: unit.teacherId, teacherName: unit.teacherName, month: item.month, amount: item.accrual.amount });
      }
    });
    return rows;
  }

  /**
   * Сводка по всем преподавателям за месяц — GET /salary. TEACHER видит
   * только себя (сужение по id, как в TeacherAttendanceService.report).
   */
  async overview(query: SalaryOverviewQueryDto, actor: SessionUser) {
    const month = query.month && isValidMonth(query.month) ? query.month : currentMonthKey();
    const teacherFilter = actor.role === "TEACHER" ? actor.id : undefined;

    const units = await this.loadUnits({ branchId: query.branchId, teacherId: teacherFilter });

    const schedules = await Promise.all(
      units.map(async (unit) => {
        const { months, marksByMonth } = await this.unitSchedule(unit, month);
        return { unit, months, marks: marksByMonth.get(month) };
      })
    );

    const teacherIds = [...new Set(units.map((unit) => unit.teacherId))];
    // С фильтром по филиалу начисленное считается ТОЛЬКО по единицам этого
    // филиала (units выше уже отфильтрованы) — значит, и выплаченное нужно
    // брать только по выплатам с тем же снимком branchId, иначе долг = начислено
    // (филиал) − выплачено (все филиалы) окажется завышен. branchId выплаты —
    // это филиал преподавателя НА МОМЕНТ выдачи, а не филиал группы, поэтому
    // разбивка по филиалам приблизительная; точный долг преподавателя — сводка
    // без фильтра по филиалу, там выплаты берутся все.
    const payouts =
      teacherIds.length > 0
        ? await this.prisma.teacherPayout.findMany({
            where: {
              teacherId: { in: teacherIds },
              deletedAt: null,
              ...(query.branchId ? { branchId: query.branchId } : {}),
            },
            select: { teacherId: true, amount: true, forMonth: true, paidAt: true },
          })
        : [];
    const paidByTeacher = new Map<string, number>();
    for (const payout of payouts) {
      if (payoutMonth(payout) > month) continue;
      paidByTeacher.set(payout.teacherId, (paidByTeacher.get(payout.teacherId) ?? 0) + payout.amount);
    }

    interface Row {
      teacherId: string;
      teacherName: string;
      groupsCount: number;
      unratedGroupsCount: number;
      /** Групп, где сумма за месяц посчитана запасным путём — нет расписания или ни одной отметки в журнале (этап 2) */
      fallbackGroupsCount: number;
      studentsCount: number;
      base: number;
      accrued: number;
      accruedTotal: number;
      paidTotal: number;
      debt: number;
    }
    const rows = new Map<string, Row>();

    // Итоги по базе/ученикам/группам считаются НЕ суммой по rows — у группы
    // с заменой в месяце несколько единиц (владелец + заменяющие, см.
    // loadUnits), и base/studentsCount в accrual каждой единицы — это
    // ПОЛНАЯ база и полное число учеников группы, а не доля заменяющего
    // (доля есть только в amount, её единицы уже делит splitAccrualByTeacher
    // между собой корректно). Наивная сумма row.base по всем строкам сложила
    // бы базу группы дважды — по разу на каждого, кто в этом месяце вёл в
    // ней хоть одно занятие. Поэтому база/ученики/группы для итога
    // считаются отдельно, по разу на пару «группа (или курс без группы) +
    // месяц» — ключ ниже не включает месяц явно, потому что вся сводка уже
    // строится для одного month.
    const groupMonthTotals = new Map<string, { base: number; studentsCount: number; isGroup: boolean }>();

    for (const { unit, months, marks } of schedules) {
      const row = rows.get(unit.teacherId) ?? {
        teacherId: unit.teacherId,
        teacherName: unit.teacherName,
        groupsCount: 0,
        unratedGroupsCount: 0,
        fallbackGroupsCount: 0,
        studentsCount: 0,
        base: 0,
        accrued: 0,
        accruedTotal: 0,
        paidTotal: 0,
        debt: 0,
      };

      if (unit.groupId) row.groupsCount += 1;
      const current = months.find((item) => item.month === month);
      if (current) {
        // Строка преподавателя — его собственный контекст: база группы, с
        // которой считалась его доля. Здесь копится намеренно по разу за
        // единицу (владелец и заменяющий — разные строки), это не повтор.
        row.studentsCount += current.accrual.studentsCount;
        row.base += current.accrual.base;
        row.accrued += current.accrual.amount;
        if (current.accrual.percentUsed === null) row.unratedGroupsCount += 1;
        // Запасной путь — только у настоящей группы (у курса без группы
        // lessonsPlanned пустое всегда, это не повод для пометки)
        if (unit.groupId && (!marks || marks.fallback)) row.fallbackGroupsCount += 1;

        const dedupKey = unit.groupId ?? `course:${unit.courseId}`;
        if (!groupMonthTotals.has(dedupKey)) {
          groupMonthTotals.set(dedupKey, {
            base: current.accrual.base,
            studentsCount: current.accrual.studentsCount,
            isGroup: unit.groupId !== null,
          });
        }
      }
      row.accruedTotal += totalAccrued(months);
      rows.set(unit.teacherId, row);
    }

    for (const row of rows.values()) {
      row.paidTotal = paidByTeacher.get(row.teacherId) ?? 0;
      row.debt = row.accruedTotal - row.paidTotal;
    }

    const result = [...rows.values()].sort((a, b) => b.debt - a.debt);
    const groupMonthEntries = [...groupMonthTotals.values()];
    return {
      month,
      rows: result,
      totals: {
        base: groupMonthEntries.reduce((sum, entry) => sum + entry.base, 0),
        studentsCount: groupMonthEntries.reduce((sum, entry) => sum + entry.studentsCount, 0),
        groupsCount: groupMonthEntries.filter((entry) => entry.isGroup).length,
        // Начисленное/выплаченное/долг — суммой по amount, который уже
        // поделён между владельцем и заменяющими (splitAccrualByTeacher),
        // повтора там нет, дедупликация не нужна
        accrued: result.reduce((sum, row) => sum + row.accrued, 0),
        paid: result.reduce((sum, row) => sum + row.paidTotal, 0),
        debt: result.reduce((sum, row) => sum + row.debt, 0),
      },
    };
  }

  /**
   * Разбивка одного преподавателя по группам и месяцам — GET /salary/:teacherId
   * и GET /salary/me. Чужой teacherId для TEACHER — 404 (ответ не должен
   * подтверждать, что такой преподаватель существует).
   */
  async teacherDetail(teacherId: string, query: TeacherSalaryQueryDto, actor: SessionUser) {
    if (actor.role === "TEACHER" && actor.id !== teacherId) {
      throw new NotFoundException("teacherNotFound");
    }

    const teacher = await this.prismaService.prismaUnscoped.user.findUnique({
      where: { id: teacherId },
      select: { id: true, firstName: true, lastName: true, salaryPercentBp: true },
    });
    if (!teacher) throw new NotFoundException("teacherNotFound");

    const month = query.month && isValidMonth(query.month) ? query.month : currentMonthKey();
    const units = await this.loadUnits({ teacherId });

    const groups = await Promise.all(
      units.map(async (unit) => {
        const { months: monthAccruals, marksByMonth } = await this.unitSchedule(unit, month);
        const idByMonth = await this.accrualIds(unit);
        return {
          groupId: unit.groupId,
          groupName: unit.groupName,
          courseId: unit.courseId,
          courseTitle: unit.courseTitle,
          branchId: unit.branchId,
          groupPercentBp: unit.groupPercentBp,
          months: monthAccruals.map((item) => {
            const marks = marksByMonth.get(item.month);
            // Отработки — понятие уровня группы (план, 4.4): считаем по ВСЕМ
            // засчитанным занятиям группы за месяц, а не только по своим, и
            // уже потом оставляем только свою часть списка
            const sessions = marks
              ? markMakeupSessions(marks.countedSessions, marks.lessonsPlanned).filter(
                  (session) => session.teacherId === unit.teacherId
                )
              : ([] as MarkedSession[]);

            return {
              id: idByMonth.get(item.month) ?? null,
              month: item.month,
              base: item.accrual.base,
              studentsCount: item.accrual.studentsCount,
              percentUsed: item.accrual.percentUsed,
              amount: item.accrual.amount,
              isFormula: item.accrual.isFormula,
              locked: item.locked,
              lessonsPlanned: item.accrual.lessonsPlanned,
              lessonsTaught: item.accrual.lessonsTaught,
              // «Отмечено N из M» (этап 2) — сколько занятий вообще есть в
              // журнале группы за месяц, независимо от того, кто их вёл.
              // null — раскладка неприменима (курс без группы)
              sessionsMarked: marks?.sessionsMarked ?? null,
              // Занятий по расписанию группы — для «отмечено N из M» и в
              // запасном пути, где у самой строки lessonsPlanned пусто
              lessonsScheduled: marks?.lessonsPlanned ?? null,
              // Раскладка недоступна — нет расписания или ни одной отметки
              // за месяц (4.5); у курса без группы это неприменимо, не пометка
              fallback: unit.groupId ? !marks || marks.fallback : false,
              sessions: sessions.map((session) => ({
                date: session.date.toISOString().slice(0, 10),
                isMakeup: session.isMakeup,
              })),
            };
          }),
        };
      })
    );

    const payouts = await this.prisma.teacherPayout.findMany({
      where: { teacherId, deletedAt: null },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    const paidTotal = payouts
      .filter((payout) => payoutMonth(payout) <= month)
      .reduce((sum, payout) => sum + payout.amount, 0);
    const accruedTotal = groups.reduce(
      (sum, group) => sum + group.months.reduce((s, m) => s + m.amount, 0),
      0
    );

    return {
      teacher: {
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        salaryPercentBp: teacher.salaryPercentBp,
      },
      month,
      groups,
      accruedTotal,
      paidTotal,
      debt: accruedTotal - paidTotal,
      payouts: payouts.map((payout) => ({
        id: payout.id,
        amount: payout.amount,
        method: payout.method,
        paidAt: payout.paidAt.toISOString(),
        forMonth: payout.forMonth,
        comment: payout.comment,
        createdBy: `${payout.createdBy.lastName} ${payout.createdBy.firstName}`,
      })),
    };
  }

  /** id зафиксированных строк единицы по месяцам — для ссылок PATCH/пересчёта в интерфейсе. */
  private async accrualIds(unit: Pick<Unit, "teacherId" | "courseId" | "groupId">) {
    const rows = await this.prisma.teacherSalaryAccrual.findMany({
      where: { teacherId: unit.teacherId, courseId: unit.courseId, groupId: unit.groupId },
      select: { id: true, month: true },
    });
    return new Map(rows.map((row) => [row.month, row.id]));
  }

  /**
   * Ручная фиксация суммы вместо формулы (или снятие фиксации, manualAmount:
   * null). Действует только на уже зафиксированную (закрытую) строку —
   * открытый месяц строки ещё не имеет и считается формулой (план, 5.5–5.6).
   */
  async setManualAmount(accrualId: string, manualAmount: number | null, actor: SessionUser) {
    const existing = await this.prisma.teacherSalaryAccrual.findUnique({ where: { id: accrualId } });
    if (!existing) throw new NotFoundException("accrualNotFound");

    const updated = await this.prisma.teacherSalaryAccrual.update({
      where: { id: accrualId },
      data: { manualAmount },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "TeacherSalaryAccrual",
      entityId: accrualId,
      action: "UPDATE",
      changes: { manualAmount: { old: existing.manualAmount, new: manualAmount } },
      metadata: { teacherId: existing.teacherId, month: existing.month, groupId: existing.groupId },
    });

    return { amount: updated.manualAmount ?? updated.amount };
  }

  /**
   * Перезаписывает закрытый месяц ГРУППЫ (или курса без группы) по актуальной
   * базе и журналу — сразу все строки месяца: владельцу и каждому, кто вёл.
   *
   * Раньше пересчитывалась одна строка того, на кого нажали. Замена,
   * отмеченная в журнале после закрытия месяца, урезала долю владельца при
   * его пересчёте, а строки у заменяющего не было и завести её было нечем
   * (accrualNotFound) — часть суммы группы не доставалась никому. Месяц
   * группы делится как единое целое, поэтому и пересчитывается целиком.
   *
   * Ставка, по которой считали (percentUsed), берётся ЗАФИКСИРОВАННАЯ, а не
   * текущая — ровно как priceUsed в billing.service.ts. Пересчёт исправляет
   * базу и раскладку, но не переписывает ставку задним числом: иначе кнопка
   * стала бы обходом самой заморозки. Исключение — месяц, замороженный вовсе
   * без ставки (см. ниже). Ручная сумма (manualAmount) не трогается.
   */
  async recalculateMonth(teacherId: string, query: RecalcQueryDto, actor: SessionUser) {
    const { month, groupId, courseId } = query;
    if (!isValidMonth(month) || !isClosedMonth(month)) throw new BadRequestException("monthNotClosed");

    const resolvedGroupId = groupId ?? null;
    const units = await this.loadUnits({ teacherId, groupId: resolvedGroupId, courseId });
    // Без группы единица определяется курсом: у педагога может быть
    // несколько курсов с учениками без группы, и первый попавшийся — это
    // пересчёт чужого курса
    if (units.length > 1) throw new BadRequestException("courseRequired");
    const unit = units[0];
    if (!unit) throw new NotFoundException("unitNotFound");

    // Все строки месяца этой группы — их и пересчитываем
    const monthRows = await this.prisma.teacherSalaryAccrual.findMany({
      where: { courseId: unit.courseId, groupId: unit.groupId, month },
    });
    if (monthRows.length === 0) throw new NotFoundException("accrualNotFound");

    // Биллинг нынешних учеников — до чтения снимка, как и в unitSchedule
    const enrollments = await this.loadUnitEnrollments(unit);
    await this.ledger.resolveSchedules(enrollments, month);
    // База — по снимку группы в MonthlyCharge: ученики, которые были в
    // группе в том месяце, включая переведённых с тех пор, и никто из
    // пришедших позже
    const { base, studentsCount } = (await this.snapshotBase(unit, month)).get(month) ?? { base: 0, studentsCount: 0 };

    // Ведущий группы в том месяце — не обязательно нынешний: педагога
    // могли сменить. Ему засчитываются занятия без явного ведущего. Если
    // строк-владельцев несколько (после удаления группы её строки переходят
    // к курсу без группы через SetNull), своя пометка того, на кого нажали,
    // важнее первой найденной
    const ownerRows = monthRows.filter((row) => row.isOwner);
    const monthOwnerId =
      ownerRows.find((row) => row.teacherId === unit.teacherId)?.teacherId ??
      ownerRows[0]?.teacherId ??
      unit.ownerTeacherId;

    // Ставка — зафиксированная. Исключение — месяц, замороженный вовсе без
    // ставки: её забыли задать, и без этого исправить такой месяц можно было
    // бы только ручной суммой
    let percentUsed =
      ownerRows.find((row) => row.teacherId === monthOwnerId)?.percentUsed ??
      monthRows.find((row) => row.percentUsed !== null)?.percentUsed ??
      null;
    if (percentUsed === null) {
      const owner = await this.prismaService.prismaUnscoped.user.findUnique({
        where: { id: monthOwnerId },
        select: { salaryPercentBp: true },
      });
      percentUsed = resolveSalaryPercentBp({
        groupPercentBp: unit.groupPercentBp,
        teacherPercentBp: owner?.salaryPercentBp ?? null,
      });
    }

    // Сумма группы целиком по формуле, а раскладка по занятиям — по СВЕЖИМ
    // данным журнала (план, 4.8.2)
    const potAmount = computeFormulaAmount(base, percentUsed);
    const marks =
      unit.groupId && unit.scheduleDays.length > 0
        ? (await this.loadLessonMarks(unit.groupId, unit.scheduleDays, monthOwnerId, [month])).get(month)
        : undefined;
    const split = marks && !marks.fallback ? marks : null;

    // Кому сколько положено в этом месяце. Запасной путь — всё владельцу;
    // раскладка — по проведённым занятиям, владелец без занятий получает
    // строку с нулём, как и при заморозке (freezeGroupClosedMonths)
    const targets = new Map<string, { amount: number; lessonsTaught: number | null }>();
    if (split) {
      for (const share of splitAccrualByTeacher(potAmount, split.lessonsPlanned, split.taughtByTeacher)) {
        targets.set(share.teacherId, { amount: share.amount, lessonsTaught: share.lessonsTaught });
      }
      if (!targets.has(monthOwnerId)) targets.set(monthOwnerId, { amount: 0, lessonsTaught: 0 });
    } else {
      targets.set(monthOwnerId, { amount: potAmount, lessonsTaught: null });
    }
    const lessonsPlanned = split ? split.lessonsPlanned : null;
    // Строка, которой больше не положено ничего (замены не было или отметки
    // сняли), обнуляется, но остаётся — она уже могла попасть в выплату
    const nothing = { amount: 0, lessonsTaught: split ? 0 : null };

    const updates = monthRows
      .map((row) => {
        const target = targets.get(row.teacherId) ?? nothing;
        const changed =
          row.percentUsed !== percentUsed ||
          row.base !== base ||
          row.studentsCount !== studentsCount ||
          row.amount !== target.amount ||
          row.lessonsPlanned !== lessonsPlanned ||
          row.lessonsTaught !== target.lessonsTaught;
        return { row, target, changed };
      })
      .filter((item) => item.changed);

    const existingTeachers = new Set(monthRows.map((row) => row.teacherId));
    const branchId = monthRows.find((row) => row.branchId !== null)?.branchId ?? unit.branchId;
    const creates = [...targets.entries()]
      .filter(([rowTeacherId]) => !existingTeachers.has(rowTeacherId))
      .map(([rowTeacherId, target]) => ({ teacherId: rowTeacherId, ...target }));

    const ownRow = monthRows.find((row) => row.teacherId === unit.teacherId);
    const ownTarget = targets.get(unit.teacherId) ?? nothing;
    const ownAmount = ownRow?.manualAmount ?? ownTarget.amount;

    if (updates.length === 0 && creates.length === 0) return { amount: ownAmount, changed: false };

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const { row, target } of updates) {
        await this.audit.record(
          {
            userId: actor.id,
            entityType: "TeacherSalaryAccrual",
            entityId: row.id,
            action: "UPDATE",
            changes: {
              percentUsed: { old: row.percentUsed, new: percentUsed },
              base: { old: row.base, new: base },
              studentsCount: { old: row.studentsCount, new: studentsCount },
              amount: { old: row.amount, new: target.amount },
              lessonsPlanned: { old: row.lessonsPlanned, new: lessonsPlanned },
              lessonsTaught: { old: row.lessonsTaught, new: target.lessonsTaught },
            },
            metadata: { recalculated: true, teacherId: row.teacherId, month, groupId: unit.groupId, courseId: unit.courseId },
          },
          tx
        );
        await tx.teacherSalaryAccrual.update({
          where: { id: row.id },
          data: { percentUsed, base, studentsCount, amount: target.amount, lessonsPlanned, lessonsTaught: target.lessonsTaught, lockedAt: now },
        });
      }

      for (const create of creates) {
        const created = await tx.teacherSalaryAccrual.create({
          data: {
            teacherId: create.teacherId,
            courseId: unit.courseId,
            groupId: unit.groupId,
            branchId,
            month,
            base,
            studentsCount,
            percentUsed,
            amount: create.amount,
            isOwner: create.teacherId === monthOwnerId,
            lessonsPlanned,
            lessonsTaught: create.lessonsTaught,
            lockedAt: now,
          },
        });
        await this.audit.record(
          {
            userId: actor.id,
            entityType: "TeacherSalaryAccrual",
            entityId: created.id,
            action: "CREATE",
            metadata: {
              recalculated: true,
              teacherId: create.teacherId,
              month,
              groupId: unit.groupId,
              courseId: unit.courseId,
              amount: create.amount,
            },
          },
          tx
        );
      }
    });

    return { amount: ownAmount, changed: true };
  }
}

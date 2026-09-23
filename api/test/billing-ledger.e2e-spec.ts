import { afterAll, beforeAll, expect, it } from "vitest";
import { BillingLedgerService } from "../src/modules/billing/billing-ledger.service";
import { addMonths, currentMonthKey } from "../src/modules/billing/domain/billing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TrashService } from "../src/modules/trash/trash.service";
import { createBranch, createTestApp, type TestApp } from "./helpers";

// Проверки перенесены из scripts/check-billing-db.ts в web один в один: те же
// названия, те же ожидания, тот же порядок. Это единственное покрытие денежной
// части, поэтому менять их при переносе нельзя.
let app: TestApp;
let prisma: PrismaService["prisma"];
let prismaUnscoped: PrismaService["prismaUnscoped"];
let ledger: BillingLedgerService;
let trash: TrashService;

beforeAll(async () => {
  app = await createTestApp();
  const prismaService = app.get(PrismaService);
  prisma = prismaService.prisma;
  prismaUnscoped = prismaService.prismaUnscoped;
  ledger = app.get(BillingLedgerService);
  trash = app.get(TrashService);
});

afterAll(async () => {
  await app.close();
});

async function check(name: string, actual: unknown, expected: unknown) {
  expect(JSON.stringify(actual), name).toBe(JSON.stringify(expected));
}

it("реестр начислений и Корзина на настоящей базе", async () => {
  // Месяц по времени школы (Ташкент), а не UTC — иначе тест мог бы поехать
  // в окне 19:00–24:00 UTC, когда в Ташкенте уже следующий месяц
  const current = currentMonthKey();
  const month = (delta: number) => addMonths(current, delta);
  const firstDay = (delta: number) => new Date(`${month(delta)}-01T12:00:00.000Z`);
  // Уникальный суффикс: повторный запуск на той же базе не упрётся в slug
  const run = Date.now().toString(36);

  const closed = [month(-4), month(-3), month(-2), month(-1)];
  const atPrice = (price: number) => closed.map((m) => [m, price]);

  const scheduleOf = async (enrollmentId: string) =>
    (await ledger.resolveSchedules(await ledger.loadBillableEnrollments({ enrollmentId }), current)).get(enrollmentId);
  const amounts = async (enrollmentId: string) =>
    ((await scheduleOf(enrollmentId)) ?? []).map((item) => [item.month, item.charge.amount]);

  // login NOT NULL с шага 2 отказа от почты — тест обходит DTO и пишет прямо
  // в базу, поэтому логин здесь только для уникальности, без проверки формата.
  // Считаем отдельным счётчиком: один и тот же курс тут записывает несколько
  // разных студентов с одинаковым `name` (`S-${courseId.slice(-4)}`), а login
  // обязан быть уникальным на каждую строку.
  let studentSeq = 0;
  const teacher = await prisma.user.create({
    data: { login: `teacher-${run}`, firstName: "T", lastName: run, role: "TEACHER" },
  });
  const branch = await createBranch();
  const student = (name: string) =>
    prisma.user.create({
      data: { login: `student-${run}-${studentSeq++}`, firstName: name, lastName: run, role: "STUDENT" },
    });
  const course = (name: string, price: number | null) =>
    prisma.course.create({ data: { slug: `${name}-${run}`, title: name, teacherId: teacher.id, price } });
  const group = (name: string, courseId: string, price: number | null) =>
    prisma.group.create({
      data: { name: `${name}-${run}`, courseId, price, scheduleDays: [1, 3, 5], branchId: branch.id },
    });
  const enroll = async (
    courseId: string,
    extra: { groupId?: string; priceOverride?: number } = {}
  ) => {
    const { id: studentId } = await student(`S-${courseId.slice(-4)}`);
    return prisma.enrollment.create({ data: { studentId, courseId, startsAt: firstDay(-4), ...extra } });
  };

  console.log("── Корзина: окончательное удаление ──");
  const trashedCourse = await course("trashed", 100);
  await prisma.course.update({ where: { id: trashedCourse.id }, data: { deletedAt: new Date() } });
  await check("курс из Корзины удаляется", await trash.hardDeleteCourseRecord(trashedCourse.id, teacher.id), { ok: true });
  await check("строки курса больше нет", await prismaUnscoped.course.count({ where: { id: trashedCourse.id } }), 0);
  const audit = await prismaUnscoped.auditLog.findFirst({
    where: { entityId: trashedCourse.id, action: "DELETE" },
  });
  await check(
    "удаление записано в журнал",
    (audit?.metadata as Record<string, unknown> | null)?.hardDelete,
    true
  );

  const liveCourse = await course("live", 100);
  await check(
    "живой курс в обход Корзины не удаляется",
    await trash.hardDeleteCourseRecord(liveCourse.id, teacher.id),
    { ok: false, error: "notInTrash" }
  );
  await check("несуществующий курс", await trash.hardDeleteCourseRecord("missing", teacher.id), {
    ok: false,
    error: "courseNotFound",
  });

  const lesson = await prisma.lesson.create({
    data: { slug: `lesson-${run}`, title: "L", courseId: liveCourse.id },
  });
  await prisma.lesson.update({ where: { id: lesson.id }, data: { deletedAt: new Date() } });
  await check("урок из Корзины удаляется", await trash.hardDeleteLessonRecord(lesson.id, teacher.id), { ok: true });
  await check("строки урока больше нет", await prismaUnscoped.lesson.count({ where: { id: lesson.id } }), 0);

  // ── какие записи платные ──
  const priced = await course("priced", 650000);
  const free = await course("free", null);
  const pricedGroup = await group("priced", free.id, 500000);
  const byCourse = await enroll(priced.id);
  const byGroup = await enroll(free.id, { groupId: pricedGroup.id });
  const byStudent = await enroll(free.id, { priceOverride: 400000 });
  const noPrice = await enroll(free.id);
  const billable = new Set((await ledger.loadBillableEnrollments({})).map((e) => e.id));
  await check("цена у курса — платная", billable.has(byCourse.id), true);
  await check("цена у группы — платная", billable.has(byGroup.id), true);
  await check("цена у студента на курсе без цены — платная", billable.has(byStudent.id), true);
  await check("цены нет нигде — не платная", billable.has(noPrice.id), false);

  // ── заморозка при просмотре и смена цены ──
  const g1 = await group("g1", free.id, 500000);
  const e1 = await enroll(free.id, { groupId: g1.id });
  await scheduleOf(e1.id); // просмотр замораживает закрытые месяцы
  await check(
    "заморожены только закрытые месяцы, с ценой расчёта",
    (await prisma.monthlyCharge.findMany({ where: { enrollmentId: e1.id }, orderBy: { month: "asc" } })).map(
      (row) => [row.month, row.amount, row.priceUsed]
    ),
    closed.map((m) => [m, 500000, 500000])
  );
  await ledger.freezeClosedMonths({ groupId: g1.id }); // как updateGroup перед записью
  await prisma.group.update({ where: { id: g1.id }, data: { price: 800000 } });
  await check("новая цена группы — только с текущего месяца", await amounts(e1.id), [
    ...atPrice(500000),
    [current, 800000],
  ]);
  await Promise.all([ledger.freezeClosedMonths({ enrollmentId: e1.id }), ledger.freezeClosedMonths({ groupId: g1.id })]);
  await check("параллельные заморозки не плодят дубли", await prisma.monthlyCharge.count({ where: { enrollmentId: e1.id } }), 4);

  // ── бесплатная запись становится платной ──
  const g2 = await group("g2", free.id, null);
  const e2 = await enroll(free.id, { groupId: g2.id });
  await ledger.freezeClosedMonths({ groupId: g2.id }); // как updateGroup
  await prisma.group.update({ where: { id: g2.id }, data: { price: 500000 } });
  await check("цену поставили группе — прошлое осталось нулевым", await amounts(e2.id), [...atPrice(0), [current, 500000]]);

  const e3 = await enroll(free.id);
  await ledger.freezeClosedMonths({ enrollmentId: e3.id }); // как moveStudentToGroup
  await prisma.enrollment.update({ where: { id: e3.id }, data: { groupId: pricedGroup.id } });
  await check("перевели в платную группу — прошлое осталось нулевым", await amounts(e3.id), [...atPrice(0), [current, 500000]]);

  const e4 = await enroll(free.id);
  await ledger.freezeClosedMonths({ enrollmentId: e4.id }); // как updateEnrollmentBilling
  await prisma.enrollment.update({ where: { id: e4.id }, data: { priceOverride: 300000 } });
  await check("поставили цену студенту — прошлое осталось нулевым", await amounts(e4.id), [...atPrice(0), [current, 300000]]);

  const late = await course("late-price", null);
  const e5 = await enroll(late.id);
  await ledger.freezeClosedMonths({ courseId: late.id }); // как updateCourse
  await prisma.course.update({ where: { id: late.id }, data: { price: 650000 } });
  await check("поставили цену курсу — прошлое осталось нулевым", await amounts(e5.id), [...atPrice(0), [current, 650000]]);

  // ── платная запись становится бесплатной ──
  const g3 = await group("g3", free.id, 500000);
  const e6 = await enroll(free.id, { groupId: g3.id });
  await scheduleOf(e6.id);
  await ledger.freezeClosedMonths({ groupId: g3.id });
  await prisma.group.update({ where: { id: g3.id }, data: { price: null } });
  await check("цену группы убрали — замороженный долг остался в расчёте", await amounts(e6.id), [
    ...atPrice(500000),
    [current, 0],
  ]);

  const g4 = await group("g4", free.id, 500000);
  const e7 = await enroll(free.id, { groupId: g4.id });
  await scheduleOf(e7.id);
  await ledger.freezeClosedMonths({ groupId: g4.id }); // как deleteGroup
  await prisma.enrollment.updateMany({ where: { groupId: g4.id }, data: { groupId: null } });
  await prisma.group.delete({ where: { id: g4.id } });
  await check("группу удалили — замороженный долг остался в расчёте", await amounts(e7.id), [
    ...atPrice(500000),
    [current, 0],
  ]);

  const zeroOnly = await enroll(free.id);
  await ledger.freezeClosedMonths({ enrollmentId: zeroOnly.id });
  await check(
    "бесплатная запись с нулями в реестре в расчёт не попадает",
    (await ledger.loadBillableEnrollments({ enrollmentId: zeroOnly.id })).length,
    0
  );

  // ── отчёт на прошлый месяц ──
  const report = await ledger.resolveSchedules(await ledger.loadBillableEnrollments({ enrollmentId: e1.id }), month(-3));
  await check(
    "отчёт на прошлый месяц не тянет более поздние замороженные",
    report.get(e1.id)?.map((item) => item.month),
    [month(-4), month(-3)]
  );
});

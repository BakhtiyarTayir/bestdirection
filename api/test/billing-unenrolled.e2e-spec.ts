import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toNoonUtc } from "../src/common/date-only";
import { BillingLedgerService } from "../src/modules/billing/billing-ledger.service";
import { addMonths, currentDateKey, currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Отчисленному ученику начисления не возобновляются от правки даты окончания.
// Даты считаются от текущего месяца по Ташкенту, не от дня недели: группы без
// расписания (расчёт по дням), поэтому сумма не зависит от того, какой сегодня день.
describe("отчисленный ученик: начисления и дата ухода", () => {
  let app: TestApp;
  let cookie: string;
  let ledger: BillingLedgerService;
  let courseId: string;
  let groupId: string;
  let branchId: string;
  const run = Date.now().toString(36);
  const current = currentMonthKey();
  const today = currentDateKey();
  // Последний день месяца, который уже закрыт и раньше предыдущего
  const leftDay = `${addMonths(current, -2)}-28`;
  const startDay = `${addMonths(current, -4)}-01`;
  const http = () => request(app.getHttpServer());
  const patch = (id: string, body: object) =>
    http().patch(`/api/v2/billing/enrollments/${id}`).set("Cookie", cookie).set("Origin", TEST_APP_URL).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    ledger = app.get(BillingLedgerService);
    const admin = await createUser({ role: "ADMIN" });
    cookie = await sessionCookie(admin, { roleInToken: "ADMIN" });
    branchId = (await createBranch(`unenr-${run}`)).id;
    const course = await testDb().course.create({ data: { slug: `unenr-${run}`, title: "Unenr", teacherId: admin.id } });
    courseId = course.id;
    const group = await testDb().group.create({ data: { name: `unenr-${run}`, courseId, branchId, price: 300000, scheduleDays: [] } });
    groupId = group.id;
  });
  afterAll(async () => { await app.close(); });

  // Отчисленная запись: группы нет, помнит группу отчисления
  const unenrolled = async (extra: { billingEndsAt?: string | null; priceOverride?: number | null } = {}) => {
    const student = await createUser({ role: "STUDENT" });
    return testDb().enrollment.create({
      data: {
        studentId: student.id, courseId, groupId: null, unenrolledFromGroupId: groupId,
        startsAt: toNoonUtc(startDay), unenrolledAt: toNoonUtc(leftDay), priceOverride: 300000,
        billingEndsAt: extra.billingEndsAt ? toNoonUtc(extra.billingEndsAt) : null,
        ...(extra.priceOverride !== undefined ? { priceOverride: extra.priceOverride } : {}),
      },
    });
  };
  const monthAmount = async (enrollmentId: string, month: string) => {
    const schedule = (await ledger.resolveSchedules(await ledger.loadBillableEnrollments({ enrollmentId }), current)).get(enrollmentId);
    return schedule?.find((item) => item.month === month)?.charge.amount ?? 0;
  };

  it("billingEndsAt очищен прямой записью в базу: после отчисления начислений нет", async () => {
    const enrollment = await unenrolled({ billingEndsAt: null });
    expect(await monthAmount(enrollment.id, addMonths(current, -2))).toBeGreaterThan(0);
    expect(await monthAmount(enrollment.id, addMonths(current, -1))).toBe(0);
    expect(await monthAmount(enrollment.id, current)).toBe(0);
  });

  it("billingEndsAt позже отчисления: тоже нет начислений", async () => {
    const enrollment = await unenrolled({ billingEndsAt: `${addMonths(current, 1)}-01` });
    expect(await monthAmount(enrollment.id, addMonths(current, -1))).toBe(0);
    expect(await monthAmount(enrollment.id, current)).toBe(0);
  });

  it("PATCH отчисленному: пустая дата — 400 unenrolledBillingEnd", async () => {
    const enrollment = await unenrolled();
    const res = await patch(enrollment.id, { priceOverride: 300000 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("unenrolledBillingEnd");
  });

  it("PATCH отчисленному: дата позже сегодня — 400 unenrollDateInFuture, раньше начала — endBeforeStart", async () => {
    const enrollment = await unenrolled();
    const future = await patch(enrollment.id, { billingEndsAt: "2099-01-01" });
    expect(future.status).toBe(400);
    expect(JSON.stringify(future.body)).toContain("unenrollDateInFuture");
    const early = await patch(enrollment.id, { billingEndsAt: `${addMonths(current, -6)}-01` });
    expect(early.status).toBe(400);
    expect(JSON.stringify(early.body)).toContain("endBeforeStart");
    const unchanged = await testDb().enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(unchanged.unenrolledAt?.toISOString().slice(0, 10)).toBe(leftDay);
  });

  it("PATCH отчисленному: дата позже прежней, но не позже сегодня — двигает unenrolledAt и billingEndsAt вместе, пишет один аудит", async () => {
    const enrollment = await unenrolled({ billingEndsAt: leftDay });
    const res = await patch(enrollment.id, { billingEndsAt: today, priceOverride: 300000 });
    expect(res.status).toBe(200);
    const updated = await testDb().enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.unenrolledAt?.toISOString().slice(0, 10)).toBe(today);
    expect(updated.billingEndsAt?.toISOString().slice(0, 10)).toBe(today);
    // Закрытый месяц между отчислением и сегодня был заморожен до записи — нулём
    expect(await monthAmount(enrollment.id, addMonths(current, -1))).toBe(0);
    // Текущий месяц теперь начисляется до дня ухода
    expect(await monthAmount(enrollment.id, current)).toBeGreaterThan(0);
    const audits = await testDb().auditLog.findMany({ where: { entityType: "Enrollment", entityId: enrollment.id, action: "UPDATE" } });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0].changes)).toContain("unenrolledAt");
  });

  it("возврат в группу: начисления идут со дня возврата", async () => {
    const enrollment = await unenrolled({ billingEndsAt: leftDay });
    const res = await http().post(`/api/v2/groups/${groupId}/students`).set("Cookie", cookie).set("Origin", TEST_APP_URL)
      .send({ studentIds: [enrollment.studentId] });
    expect(res.status).toBe(201);
    const back = await testDb().enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(back.unenrolledAt).toBeNull();
    expect(back.billingEndsAt).toBeNull();
    // Разрыв между отчислением и возвратом не начисляется, текущий месяц — идёт
    expect(await monthAmount(enrollment.id, addMonths(current, -1))).toBe(0);
    expect(await monthAmount(enrollment.id, current)).toBeGreaterThan(0);
  });

  it("карточка записи отчисленного отдаёт unenrolledAt, подсказка не начисляет после отчисления", async () => {
    const enrollment = await unenrolled();
    const res = await http().get(`/api/v2/billing/enrollments/${enrollment.id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.unenrolledAt).toContain(leftDay);
  });

  it("«ходит, но не платит» показывает отчисленного с отметкой после даты отчисления", async () => {
    const enrollment = await unenrolled();
    const other = await createUser({ role: "STUDENT" });
    // Второй отчисленный ходил только до даты отчисления — в списке быть не должен
    const quiet = await testDb().enrollment.create({
      data: { studentId: other.id, courseId, groupId: null, unenrolledFromGroupId: groupId,
        startsAt: toNoonUtc(startDay), unenrolledAt: toNoonUtc(leftDay), priceOverride: 300000 },
    });
    const after = await testDb().attendanceSession.create({ data: { courseId, groupId, date: toNoonUtc(`${addMonths(current, -2)}-29`) } });
    const before = await testDb().attendanceSession.create({ data: { courseId, groupId, date: toNoonUtc(`${addMonths(current, -2)}-20`) } });
    await testDb().attendanceRecord.create({ data: { sessionId: after.id, studentId: enrollment.studentId, status: "LATE" } });
    await testDb().attendanceRecord.create({ data: { sessionId: before.id, studentId: other.id, status: "PRESENT" } });
    const res = await http().get(`/api/v2/dashboard/admin?branchId=${branchId}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    const rows = res.body.attention.attendingWithoutBilling as { enrollmentId: string; unenrolled: boolean; billingEndsAt: string }[];
    const row = rows.find((entry) => entry.enrollmentId === enrollment.id);
    expect(row).toMatchObject({ unenrolled: true, billingEndsAt: leftDay });
    expect(rows.some((entry) => entry.enrollmentId === quiet.id)).toBe(false);
  });
});

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GroupsService } from "../src/modules/groups/groups.service";
import { toNoonUtc } from "../src/common/date-only";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("посещение после остановки начислений", () => {
  let app: TestApp;
  let cookie: string;
  let courseId: string;
  let groupId: string;
  let branchId: string;
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const get = (path: string) => request(app.getHttpServer()).get(`/api/v2${path}`).set("Cookie", cookie);
  const post = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v2${path}`)
    .set("Cookie", cookie).set("Origin", TEST_APP_URL).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createUser({ role: "ADMIN" });
    cookie = await sessionCookie(admin, { roleInToken: "ADMIN" });
    const branch = await createBranch(`alert-${run}`); branchId = branch.id;
    const course = await testDb().course.create({ data: { slug: `alert-${run}`, title: "Alert course", teacherId: admin.id } });
    courseId = course.id;
    const group = await testDb().group.create({ data: { name: `alert-${run}`, courseId, branchId, price: 100000, scheduleDays: [1] } });
    groupId = group.id;
    const before = await testDb().attendanceSession.create({ data: { courseId, groupId, date: toNoonUtc("2026-10-09") } });
    const after = await testDb().attendanceSession.create({ data: { courseId, groupId, date: toNoonUtc("2026-10-11") } });
    for (const key of ["present", "absent", "before", "retired", "inactive", "pause", "left"] as const) {
      const user = await createUser({ role: "STUDENT", isActive: key !== "inactive" });
      ids[key] = user.id;
      await testDb().enrollment.create({ data: { studentId: user.id, courseId, groupId, startsAt: toNoonUtc("2026-10-01"), billingEndsAt: toNoonUtc("2026-10-10"),
        ...(key === "retired" ? { groupId: null, unenrolledAt: toNoonUtc("2026-10-10"), unenrolledFromGroupId: groupId } : {}) } });
      if (key !== "pause" && key !== "left") await testDb().attendanceRecord.create({ data: { sessionId: key === "before" ? before.id : after.id,
        studentId: user.id, status: key === "absent" ? "ABSENT" : "PRESENT" } });
    }
  });
  afterAll(async () => { await app.close(); });

  it("counts only active attendees after the final day and filters by group branch", async () => {
    const response = await get(`/dashboard/admin?branchId=${branchId}`);
    expect(response.status).toBe(200);
    expect(response.body.attention.attendingWithoutBilling.map((row: { studentId: string }) => row.studentId)).toEqual([ids.present]);
    expect((await get("/dashboard/admin?branchId=other-branch")).body.attention.attendingWithoutBilling).toEqual([]);
  });

  it("returns billingEndsAt in enrolled students", async () => {
    const result = await get(`/courses/${courseId}/students?groupId=${groupId}`);
    expect(result.status).toBe(200);
    expect(result.body.find((row: { id: string }) => row.id === ids.present).billingEndsAt).toContain("2026-10-10");
  });

  it("pauses without removing the group", async () => {
    const enrollment = await testDb().enrollment.findUniqueOrThrow({ where: { studentId_courseId: { studentId: ids.pause, courseId } } });
    const result = await request(app.getHttpServer()).patch(`/api/v2/billing/enrollments/${enrollment.id}`)
      .set("Cookie", cookie).set("Origin", TEST_APP_URL).send({ billingEndsAt: "2026-10-12", priceOverride: 90000 });
    expect(result.status).toBe(200);
    const updated = await testDb().enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.groupId).toBe(groupId);
    expect(updated.unenrolledAt).toBeNull();
    expect(updated.priceOverride).toBe(90000);
  });

  it("saves billing and leaves atomically, preserving enrollment", async () => {
    const path = `/groups/${groupId}/students/${ids.left}/billing-unenrollment`;
    const failed = await post(path, { billingEndsAt: "2026-09-01", startsAt: "2026-10-01", priceOverride: 80000 });
    expect(failed.status).toBe(400);
    const original = await testDb().enrollment.findUniqueOrThrow({ where: { studentId_courseId: { studentId: ids.left, courseId } } });
    expect(original.priceOverride).toBeNull();
    expect(original.groupId).toBe(groupId);
    const groups = app.get(GroupsService);
    const failure = vi.spyOn(groups, "finishUnenrollment").mockRejectedValueOnce(new Error("unenrollment failed"));
    try {
      expect((await post(path, { billingEndsAt: "2026-10-12", startsAt: "2026-10-01", priceOverride: 80000 })).status).toBeGreaterThanOrEqual(500);
    } finally { failure.mockRestore(); }
    const rolledBack = await testDb().enrollment.findUniqueOrThrow({ where: { id: original.id } });
    expect(rolledBack.priceOverride).toBeNull();
    expect(rolledBack.groupId).toBe(groupId);
    expect(rolledBack.billingEndsAt?.toISOString().slice(0, 10)).toBe("2026-10-10");
    const result = await post(path, { billingEndsAt: "2026-10-12", startsAt: "2026-10-01", priceOverride: 80000, firstMonthCharge: 50000 });
    expect(result.status).toBe(201);
    const updated = await testDb().enrollment.findUniqueOrThrow({ where: { id: original.id } });
    expect(updated.groupId).toBeNull();
    expect(updated.unenrolledAt?.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(updated.billingEndsAt?.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(updated.priceOverride).toBe(80000);
    expect(updated.firstMonthCharge).toBe(50000);
  });
});

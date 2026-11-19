import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Перевод ученика в другую группу курса не должен «прятать» его отметки:
// журнал старой группы показывает его как бывшего (withFormer).
describe("бывшие ученики группы и аудит перевода", () => {
  let app: TestApp;
  let adminCookie: string;
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createUser({ role: "ADMIN" });
    ids.admin = admin.id;
    adminCookie = await sessionCookie(admin, { roleInToken: "ADMIN" });
    const teacher = await createUser({ role: "TEACHER" });
    const student = await createUser({ role: "STUDENT" });
    ids.student = student.id;
    const branch = await createBranch();
    const course = await testDb().course.create({
      data: { slug: `fs-${run}`, title: "Курс", teacherId: teacher.id, price: 100000 },
    });
    ids.course = course.id;
    const a = await testDb().group.create({ data: { name: `A-${run}`, courseId: course.id, branchId: branch.id, teacherId: teacher.id } });
    const b = await testDb().group.create({ data: { name: `B-${run}`, courseId: course.id, branchId: branch.id, teacherId: teacher.id } });
    ids.a = a.id;
    ids.b = b.id;
    await testDb().enrollment.create({ data: { studentId: student.id, courseId: course.id, groupId: a.id } });
    const session = await testDb().attendanceSession.create({
      data: { courseId: course.id, groupId: a.id, date: new Date("2026-10-05T00:00:00Z") },
    });
    await testDb().attendanceRecord.create({ data: { sessionId: session.id, studentId: student.id, status: "PRESENT" } });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const list = (query: string) =>
    http().get(`/api/v2/courses/${ids.course}/students?${query}`).set("Cookie", adminCookie);

  it("до перевода ученик текущий: former=false", async () => {
    const res = await list(`groupId=${ids.a}&withFormer=true`).expect(200);
    const row = res.body.find((s: { id: string }) => s.id === ids.student);
    expect(row).toMatchObject({ former: false, currentGroupName: null });
  });

  it("после перевода: в старой группе — former с именем новой, без withFormer — нет", async () => {
    await http()
      .post(`/api/v2/groups/${ids.b}/move-student`)
      .set("Cookie", adminCookie)
      .set("Origin", TEST_APP_URL)
      .send({ studentId: ids.student, courseId: ids.course })
      .expect((r) => expect(r.status).toBeLessThan(300));

    const withFormer = await list(`groupId=${ids.a}&withFormer=true`).expect(200);
    const row = withFormer.body.find((s: { id: string }) => s.id === ids.student);
    expect(row).toMatchObject({ former: true, currentGroupName: `B-${run}` });

    const plain = await list(`groupId=${ids.a}`).expect(200);
    expect(plain.body.find((s: { id: string }) => s.id === ids.student)).toBeUndefined();
    expect(plain.body.every((s: object) => !("former" in s))).toBe(true);

    const inB = await list(`groupId=${ids.b}&withFormer=true`).expect(200);
    expect(inB.body.find((s: { id: string }) => s.id === ids.student)).toMatchObject({ former: false });
  });

  it("перевод пишется в AuditLog с groupId old/new", async () => {
    const enrollment = await testDb().enrollment.findFirstOrThrow({ where: { studentId: ids.student, courseId: ids.course } });
    const log = await testDb().auditLog.findFirstOrThrow({
      where: { entityType: "Enrollment", entityId: enrollment.id, action: "UPDATE" },
    });
    expect(log.userId).toBe(ids.admin);
    expect(log.changes).toEqual({ groupId: { old: ids.a, new: ids.b } });
    expect(log.metadata).toEqual({ courseId: ids.course, studentId: ids.student });
  });

  it("отчисленный из группы остаётся бывшим без currentGroupName", async () => {
    await http()
      .delete(`/api/v2/groups/${ids.b}/students/${ids.student}?alsoUnenroll=true`)
      .set("Cookie", adminCookie)
      .set("Origin", TEST_APP_URL);
    const res = await list(`groupId=${ids.a}&withFormer=true`).expect(200);
    expect(res.body.find((s: { id: string }) => s.id === ids.student)).toMatchObject({ former: true, currentGroupName: null });
  });

  it("студент видит группу занятия в посещаемости по всем группам", async () => {
    const res = await http().get(`/api/v2/attendance/student?studentId=${ids.student}`).set("Cookie", adminCookie).expect(200);
    expect(res.body[0].records[0].groupName).toBe(`A-${run}`);
  });
});

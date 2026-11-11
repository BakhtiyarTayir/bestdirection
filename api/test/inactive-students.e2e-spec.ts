import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("отключённые ученики и посещаемость", () => {
  let app: TestApp;
  let adminCookie: string;
  let courseId: string;
  let groupId: string;
  let sessionId: string;
  const run = Date.now().toString(36);
  const students: Record<string, string> = {};

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v2${path}`).set("Cookie", adminCookie);
  const patch = (path: string, body: object) => request(app.getHttpServer()).patch(`/api/v2${path}`)
    .set("Cookie", adminCookie).set("Origin", TEST_APP_URL).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createUser({ role: "ADMIN" });
    adminCookie = await sessionCookie(admin, { roleInToken: "ADMIN" });
    const branch = await createBranch();
    const course = await testDb().course.create({ data: { slug: `inactive-${run}`, title: "Inactive course", teacherId: admin.id } });
    courseId = course.id;
    const group = await testDb().group.create({ data: { name: `Inactive-${run}`, courseId, branchId: branch.id } });
    groupId = group.id;
    const session = await testDb().attendanceSession.create({ data: { courseId, groupId, date: new Date("2026-11-10T00:00:00.000Z") } });
    sessionId = session.id;
    for (const key of ["oldRecord", "noRecord", "retired", "unenroll", "rollback", "onlyInactive"] as const) {
      const user = await createUser({ role: "STUDENT" });
      students[key] = user.id;
      await testDb().enrollment.create({ data: { studentId: user.id, courseId, groupId } });
    }
    await testDb().attendanceRecord.create({ data: { sessionId, studentId: students.oldRecord, status: "PRESENT", note: "old" } });
    await testDb().user.updateMany({ where: { id: { in: [students.oldRecord, students.noRecord] } }, data: { isActive: false } });
    await testDb().enrollment.update({ where: { studentId_courseId: { studentId: students.retired, courseId } },
      data: { groupId: null, unenrolledFromGroupId: groupId, unenrolledAt: new Date("2026-11-01T12:00:00.000Z") } });
  });
  afterAll(async () => { await app.close(); });

  it("скрывает отключённого в списке и запрещает новую отметку, сохраняя старую", async () => {
    const list = await get(`/courses/${courseId}/students?groupId=${groupId}`);
    expect(list.status).toBe(200);
    expect(list.body.map((student: { id: string }) => student.id)).not.toContain(students.oldRecord);
    expect(list.body.map((student: { id: string }) => student.id)).not.toContain(students.noRecord);
    const denied = await patch(`/attendance/sessions/${sessionId}/records`, {
      records: [{ studentId: students.noRecord, status: "ABSENT" }],
    });
    expect(denied.status).toBe(400);
    expect(denied.body.message).toBe("studentInactive");
    const updated = await patch(`/attendance/sessions/${sessionId}/records`, {
      records: [{ studentId: students.oldRecord, status: "LATE", note: "corrected" }],
    });
    expect(updated.status).toBe(200);
    const sessions = await get(`/attendance/sessions?courseId=${courseId}&groupId=${groupId}`);
    expect(sessions.body[0].records).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: students.oldRecord, status: "LATE", note: "corrected",
        student: expect.objectContaining({ id: students.oldRecord, firstName: expect.any(String) }) }),
    ]));
  });

  it("отчёт оставляет ученика с историей и убирает без отметок", async () => {
    const report = await get(`/attendance/report?courseId=${courseId}&groupId=${groupId}`);
    expect(report.status).toBe(200);
    const ids = report.body.students.map((row: { student: { id: string } }) => row.student.id);
    expect(ids).toContain(students.oldRecord);
    expect(ids).not.toContain(students.noRecord);
    expect(ids).not.toContain(students.retired);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("отключение с отчислением ставит дату и сохраняет аудит", async () => {
    const res = await patch(`/users/${students.unenroll}`, { isActive: false, unenrollGroupIds: [groupId], unenrollDate: "2026-11-05" });
    expect(res.status).toBe(200);
    expect((await testDb().user.findUnique({ where: { id: students.unenroll } }))?.isActive).toBe(false);
    const enrollment = await testDb().enrollment.findUnique({ where: { studentId_courseId: { studentId: students.unenroll, courseId } } });
    expect(enrollment?.unenrolledAt?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(enrollment?.groupId).toBeNull();
    const audit = await testDb().auditLog.findFirst({ where: { entityType: "User", entityId: students.unenroll }, orderBy: { createdAt: "desc" } });
    expect(audit?.metadata).toEqual(expect.objectContaining({ unenrollGroupIds: [groupId], unenrollDate: "2026-11-05" }));
  });

  it("ошибка группы оставляет пользователя и запись без изменений", async () => {
    const res = await patch(`/users/${students.rollback}`, { isActive: false, unenrollGroupIds: [groupId, "foreign-group"], unenrollDate: "2026-11-05" });
    expect(res.status).toBe(404);
    expect((await testDb().user.findUnique({ where: { id: students.rollback } }))?.isActive).toBe(true);
    const enrollment = await testDb().enrollment.findUnique({ where: { studentId_courseId: { studentId: students.rollback, courseId } } });
    expect(enrollment?.groupId).toBe(groupId);
    expect(enrollment?.unenrolledAt).toBeNull();
  });

  it("будущей датой не отчисляет и не отключает", async () => {
    const res = await patch(`/users/${students.rollback}`, { isActive: false, unenrollGroupIds: [groupId], unenrollDate: "2099-01-01" });
    expect(res.status).toBe(400);
    expect((await testDb().user.findUnique({ where: { id: students.rollback } }))?.isActive).toBe(true);
    const enrollment = await testDb().enrollment.findUnique({ where: { studentId_courseId: { studentId: students.rollback, courseId } } });
    expect(enrollment?.groupId).toBe(groupId);
  });

  it("без выбранных групп только отключает", async () => {
    const res = await patch(`/users/${students.onlyInactive}`, { isActive: false });
    expect(res.status).toBe(200);
    expect((await testDb().user.findUnique({ where: { id: students.onlyInactive } }))?.isActive).toBe(false);
    const enrollment = await testDb().enrollment.findUnique({ where: { studentId_courseId: { studentId: students.onlyInactive, courseId } } });
    expect(enrollment?.groupId).toBe(groupId);
    expect(enrollment?.unenrolledAt).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { canManageCourseAttendance, canManageSession } from "./attendance-access";

// Проверки перенесены из scripts/check-attendance-db.ts в web один в один.
describe("кто может вести занятие", () => {
  const admin = { id: "admin", role: "ADMIN" };
  const courseTeacher = { id: "course-teacher", role: "TEACHER" };
  const groupTeacher = { id: "group-teacher", role: "TEACHER" };
  const substitute = { id: "substitute", role: "TEACHER" };
  const stranger = { id: "stranger", role: "TEACHER" };
  const student = { id: "student", role: "STUDENT" };

  const session = {
    teacherId: substitute.id,
    course: { teacherId: courseTeacher.id },
    group: { teacherId: groupTeacher.id },
  };

  it("администратор — да", () => expect(canManageSession(admin, session)).toBe(true));
  it("преподаватель курса — да", () => expect(canManageSession(courseTeacher, session)).toBe(true));
  it("преподаватель группы — да", () => expect(canManageSession(groupTeacher, session)).toBe(true));
  it("заменяющий, записанный ведущим, — да", () =>
    expect(canManageSession(substitute, session)).toBe(true));
  it("посторонний преподаватель — нет", () => expect(canManageSession(stranger, session)).toBe(false));
  it("ученик — нет", () => expect(canManageSession(student, session)).toBe(false));
  it("занятие без группы: педагог группы уже ни при чём", () =>
    expect(canManageSession(groupTeacher, { ...session, teacherId: null, group: null })).toBe(false));
});

describe("кто может заводить занятия курса", () => {
  const courseTeacher = { id: "course-teacher", role: "TEACHER" };
  const groupTeacher = { id: "group-teacher", role: "TEACHER" };
  const stranger = { id: "stranger", role: "TEACHER" };
  const course = {
    teacherId: courseTeacher.id,
    groups: [
      { id: "g1", teacherId: groupTeacher.id },
      { id: "g2", teacherId: stranger.id },
    ],
  };

  it("преподаватель курса — да", () =>
    expect(canManageCourseAttendance(courseTeacher, course)).toBe(true));
  it("педагог своей группы — да", () =>
    expect(canManageCourseAttendance(groupTeacher, course, "g1")).toBe(true));
  it("педагог чужой группы — нет", () =>
    expect(canManageCourseAttendance(groupTeacher, course, "g2")).toBe(false));
  // Занятие без группы относится ко всему курсу, поэтому его вправе завести
  // педагог любой его группы, а не только педагог курса
  it("занятие без группы заводит педагог любой группы курса", () =>
    expect(canManageCourseAttendance(groupTeacher, course, null)).toBe(true));
  it("посторонний — нет", () =>
    expect(canManageCourseAttendance({ id: "nobody", role: "TEACHER" }, course)).toBe(false));
});

import { subject } from "@casl/ability";
import { describe, expect, it } from "vitest";
import { accessibleBy, accessibleWhere, defineAbilityFor } from "./abilities";

describe("права (CASL)", () => {
  it("ADMIN может всё", () => {
    const ability = defineAbilityFor({ id: "a1", role: "ADMIN" });
    expect(ability.can("manage", "all")).toBe(true);
    expect(ability.can("delete", "User")).toBe(true);
  });

  it("MANAGER получает только перечисленные рабочие права", () => {
    const ability = defineAbilityFor({ id: "m1", role: "MANAGER" });
    for (const area of ["Course", "Group", "Billing", "Attendance", "Lead", "Marketing", "Sms", "Trash"] as const) {
      expect(ability.can("manage", area)).toBe(true);
    }
    for (const area of ["Finance", "PaymentDelete", "Refund", "Salary", "Settings", "AuditLog", "Branch", "all"] as const) {
      expect(ability.can("manage", area)).toBe(false);
    }
    expect(ability.can("read", "Branch")).toBe(true);
    expect(ability.can("read", subject("User", { id: "a1", role: "ADMIN" } as never))).toBe(true);
    expect(ability.can("update", subject("User", { id: "a1", role: "ADMIN" } as never))).toBe(false);
    expect(ability.can("create", subject("User", { role: "MANAGER" } as never))).toBe(false);
    expect(ability.can("create", subject("User", { role: "STUDENT" } as never))).toBe(true);
    expect(ability.can("update", subject("User", { id: "t1", role: "TEACHER" } as never))).toBe(true);
  });

  it.each(["TEACHER", "STUDENT", "PARENT"] as const)("%s читает только свой профиль", (role) => {
    const ability = defineAbilityFor({ id: "u1", role });
    expect(ability.can("read", subject("User", { id: "u1" } as never))).toBe(true);
    expect(ability.can("read", subject("User", { id: "someone-else" } as never))).toBe(false);
    expect(ability.can("update", subject("User", { id: "u1" } as never))).toBe(false);
    expect(ability.can("manage", "all")).toBe(false);
  });

  it("то же правило превращается в фильтр выборки Prisma", () => {
    const ability = defineAbilityFor({ id: "u1", role: "PARENT" });
    expect(accessibleBy(ability).ofType("User")).toEqual({ OR: [{ id: "u1" }] });
  });

  it("роль, для которой правил нет, не получает ничего", () => {
    const ability = defineAbilityFor({ id: "x", role: "UNKNOWN" as never });
    expect(ability.can("read", "User")).toBe(false);
  });
});

describe("выборка по правам (accessibleWhere)", () => {
  it("роль без правил получает заведомо пустое условие, а не полный доступ", () => {
    // Prisma игнорирует пустой OR внутри AND и вернула бы ВСЕ строки —
    // проверено на настоящей базе, отсюда подмена условия
    const parent = defineAbilityFor({ id: "p1", role: "PARENT" });
    expect(accessibleBy(parent).ofType("Course")).toEqual({ OR: [] });
    expect(accessibleWhere(parent, "Course")).toEqual({ id: { in: [] } });
  });

  it("правила роли переносятся в условие как есть", () => {
    const student = defineAbilityFor({ id: "s1", role: "STUDENT" });
    expect(accessibleWhere(student, "Course")).toEqual({
      OR: [{ isPublished: true, enrollments: { some: { studentId: "s1", unenrolledAt: null } } }],
    });
  });

  it("администратору условие не ограничивает ничего", () => {
    const admin = defineAbilityFor({ id: "a1", role: "ADMIN" });
    expect(accessibleWhere(admin, "Course")).toEqual({});
  });

  it("действие учитывается: преподаватель правит только свои курсы", () => {
    const teacher = defineAbilityFor({ id: "t1", role: "TEACHER" });
    expect(accessibleWhere(teacher, "Course", "update")).toEqual({ OR: [{ teacherId: "t1" }] });
    expect(accessibleWhere(teacher, "Course")).toEqual({});
  });
});

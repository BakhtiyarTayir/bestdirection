import { subject } from "@casl/ability";
import { describe, expect, it } from "vitest";
import { accessibleBy, defineAbilityFor } from "./abilities";

describe("права (CASL)", () => {
  it("ADMIN может всё", () => {
    const ability = defineAbilityFor({ id: "a1", role: "ADMIN" });
    expect(ability.can("manage", "all")).toBe(true);
    expect(ability.can("delete", "User")).toBe(true);
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

import { describe, expect, it } from "vitest";
import { advance, allocateRefunds, refundedForMonth } from "./refund";

describe("refund accounting", () => {
  it("includes future payments in available advance", () => {
    expect(advance(600, 100, 300)).toBe(200);
    expect(advance(300, 100, 300)).toBe(0);
  });
  it("takes future payments before increasing past debt", () => {
    expect(refundedForMonth({ paidUpTo: 300, paidAfter: 200, refundedUpTo: 150 })).toBe(0);
    expect(refundedForMonth({ paidUpTo: 300, paidAfter: 200, refundedUpTo: 250 })).toBe(50);
  });
  it("allocates from latest payment months", () => {
    const result = allocateRefunds(new Map([["2026-09", 100], ["2026-11", 200]]), 250);
    expect([...result.allocated]).toEqual([["2026-11", 200], ["2026-09", 50]]);
    expect(result.remaining).toBe(0);
  });
});

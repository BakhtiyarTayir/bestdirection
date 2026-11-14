export interface PairMoney {
  paidUpTo: number;
  paidAfter: number;
  refundedUpTo: number;
}

/** A refund consumes future payments before it can increase an earlier debt. */
export function refundedForMonth(money: PairMoney): number {
  return Math.max(0, money.refundedUpTo - money.paidAfter);
}

export function advance(paidAll: number, refundedAll: number, charged: number): number {
  return Math.max(0, paidAll - refundedAll - charged);
}

export function allocateRefunds(paidByMonth: Map<string, number>, refunded: number) {
  const allocated = new Map<string, number>();
  for (const month of [...paidByMonth.keys()].sort().reverse()) {
    const amount = Math.min(refunded, paidByMonth.get(month) ?? 0);
    if (amount > 0) allocated.set(month, amount);
    refunded -= amount;
    if (refunded <= 0) break;
  }
  return { allocated, remaining: refunded };
}


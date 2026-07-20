import { NextResponse } from "next/server";
import { getDebtorsCount } from "@/actions/billing-actions";

export async function GET() {
  const result = await getDebtorsCount();
  if (!result.success || !result.data) {
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json(result.data);
}

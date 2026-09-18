import { NextResponse } from "next/server";
import { getDebtorsCount } from "@/lib/api/billing.server";

// Бейдж в сайдбаре опрашивает этот роут из браузера; считает api.
export async function GET() {
  const result = await getDebtorsCount();
  if (!result.success) {
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json(result.data);
}

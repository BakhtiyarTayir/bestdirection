import { NextResponse } from "next/server";
import { getHomeworkCounts } from "@/lib/api/homework.server";

// Значок в шапке опрашивает этот адрес. Само число считает api; здесь остаётся
// тонкая обёртка, как у заявок на курсы и должников.
export async function GET() {
  const result = await getHomeworkCounts();
  if (!result.success) {
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json(result.data);
}

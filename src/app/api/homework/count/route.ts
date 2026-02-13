import { NextResponse } from "next/server";
import { getHomeworkCounts } from "@/actions/homework-review-actions";

export async function GET() {
  const result = await getHomeworkCounts();
  if (!result.success) {
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json(result.data);
}

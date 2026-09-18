import { NextResponse } from "next/server";
import { getEnrollmentRequestsCount } from "@/lib/api/courses.server";

export async function GET() {
  const result = await getEnrollmentRequestsCount();
  if (!result.success || !result.data) {
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json(result.data);
}

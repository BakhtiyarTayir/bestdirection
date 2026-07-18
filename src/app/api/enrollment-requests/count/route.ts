import { NextResponse } from "next/server";
import { getEnrollmentRequestsCount } from "@/actions/enrollment-request-actions";

export async function GET() {
  const result = await getEnrollmentRequestsCount();
  if (!result.success || !result.data) {
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json(result.data);
}

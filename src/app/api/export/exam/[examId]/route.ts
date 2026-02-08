import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const search = request.nextUrl.search;
  return NextResponse.redirect(
    new URL(`/api/v1/export/exam/${examId}${search}`, request.url),
    308
  );
}

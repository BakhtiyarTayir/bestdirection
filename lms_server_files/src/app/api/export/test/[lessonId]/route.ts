import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const search = request.nextUrl.search;
  return NextResponse.redirect(
    new URL(`/api/v1/export/test/${lessonId}${search}`, request.url),
    308
  );
}

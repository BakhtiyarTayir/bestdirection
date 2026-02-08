import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  return NextResponse.redirect(
    new URL("/api/v1/progress", request.url),
    308
  );
}

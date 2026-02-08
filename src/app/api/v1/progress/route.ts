import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "STUDENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { lessonId, watchTime, lastPosition } = body;

    if (!lessonId || typeof watchTime !== "number" || typeof lastPosition !== "number") {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    await prisma.lessonProgress.upsert({
      where: {
        studentId_lessonId: {
          studentId: session.user.id,
          lessonId,
        },
      },
      create: {
        studentId: session.user.id,
        lessonId,
        watchTime,
        lastPosition,
      },
      update: {
        watchTime,
        lastPosition,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

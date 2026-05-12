import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { lessonId } = await params;
    const format = request.nextUrl.searchParams.get("format") ?? "json";

    if (format !== "json") {
      return NextResponse.json(
        { error: "Homework export supports only JSON format" },
        { status: 400 }
      );
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: { select: { teacherId: true, slug: true } },
        homeworks: {
          orderBy: { sortOrder: "asc" },
          include: {
            testCases: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    if (
      session.user.role === "TEACHER" &&
      lesson.course.teacherId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      lesson: {
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        courseSlug: lesson.course.slug,
      },
      homeworks: lesson.homeworks.map((hw) => ({
        title: hw.title,
        description: hw.description,
        type: hw.type,
        language: hw.language,
        starterCode: hw.starterCode,
        solutionCode: hw.solutionCode,
        maxAttempts: hw.maxAttempts,
        timeLimitSec: hw.timeLimitSec,
        maxScore: hw.maxScore,
        passingScore: hw.passingScore,
        dueDate: hw.dueDate,
        allowLate: hw.allowLate,
        latePenalty: hw.latePenalty,
        requiresManualReview: hw.requiresManualReview,
        reviewInstructions: hw.reviewInstructions,
        isPublished: hw.isPublished,
        testCases: hw.testCases.map((tc) => ({
          input: tc.input,
          expected: tc.expected,
          isHidden: tc.isHidden,
          points: tc.points,
          description: tc.description,
          sortOrder: tc.sortOrder,
        })),
      })),
    };

    const encodedName = encodeURIComponent(lesson.title.replace(/\s+/g, "_"));

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''homeworks-${encodedName}.json`,
      },
    });
  } catch (error) {
    console.error("Export homework error:", error);
    return NextResponse.json(
      { error: "Failed to export homework" },
      { status: 500 }
    );
  }
}

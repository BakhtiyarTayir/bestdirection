import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dataToWorkbook, dataToCSVString, dataToJSONString } from "@/lib/spreadsheet-utils";
import type { SpreadsheetData } from "@/lib/spreadsheet-utils";
import * as XLSX from "xlsx";

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

    const assessment = await prisma.assessment.findUnique({
      where: { lessonId },
      include: {
        lesson: {
          select: {
            course: { select: { teacherId: true } },
          },
        },
        questions: {
          include: { options: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    if (
      session.user.role === "TEACHER" &&
      assessment.lesson?.course.teacherId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rawFormat = request.nextUrl.searchParams.get("format");
    const format = rawFormat === "csv" ? "csv" : rawFormat === "json" ? "json" : "xlsx";

    const data: SpreadsheetData = {
      title: assessment.title,
      passingScore: assessment.passingScore,
      timeLimitMin: assessment.timeLimitMin,
      maxAttempts: assessment.maxAttempts,
      description: null,
      questions: assessment.questions.map((q) => ({
        text: q.text,
        type: q.type,
        points: q.points,
        options: q.options.map((o) => ({
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      })),
    };

    const encodedName = encodeURIComponent(assessment.title.replace(/\s+/g, "_"));

    if (format === "json") {
      const json = dataToJSONString(data);
      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''test-${encodedName}.json`,
        },
      });
    }

    if (format === "csv") {
      const csv = dataToCSVString(data);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''test-${encodedName}.csv`,
        },
      });
    }

    const wb = dataToWorkbook(data);
    const arr: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const body = new Uint8Array(arr).buffer as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''test-${encodedName}.xlsx`,
      },
    });
  } catch (error) {
    console.error("Export test error:", error);
    return NextResponse.json(
      { error: "Failed to export test" },
      { status: 500 }
    );
  }
}

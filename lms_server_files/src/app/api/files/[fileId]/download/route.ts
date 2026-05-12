import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  const file = await prisma.submissionFile.findUnique({
    where: { id: fileId },
    include: {
      submission: {
        select: {
          studentId: true,
          homework: {
            select: {
              lesson: {
                select: {
                  course: { select: { teacherId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const isOwner = file.submission.studentId === session.user.id;
  const isTeacher = file.submission.homework.lesson.course.teacherId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  if (!isOwner && !isTeacher && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const content = await readFile(file.path);
    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": file.size.toString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not accessible" }, { status: 500 });
  }
}

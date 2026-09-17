import { NextResponse } from "next/server";
import { fileSubmissionPlaceholder } from "@/lib/homework-file-placeholder";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submissionMimeType } from "@/lib/submission-files";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
// Вне public/: работы студентов не должны раздаваться статикой в обход
// авторизованного /api/files/[fileId]
const UPLOAD_DIR = path.join(process.cwd(), "uploads/homework");

// Без .html и .svg: браузер исполняет их скрипты. Выдача всё равно отдаёт
// такие файлы вложением (src/lib/submission-files.ts), но принимать их незачем.
const ALLOWED_EXTENSIONS = new Set([
  ".py", ".js", ".ts", ".jsx", ".tsx", ".php", ".java", ".cs", ".cpp", ".c",
  ".h", ".css", ".sql", ".json", ".txt", ".md", ".ipynb",
  ".zip", ".rar", ".7z", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ homeworkId: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { homeworkId } = await params;

  // Get homework with course enrollment check
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: {
      lesson: {
        include: {
          course: {
            include: {
              enrollments: {
                where: { studentId: session.user.id },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!homework || !homework.isPublished) {
    return NextResponse.json({ error: "Homework not found" }, { status: 404 });
  }

  if (homework.lesson.course.enrollments.length === 0) {
    return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  }

  // Check attempts
  const attemptCount = await prisma.submission.count({
    where: { homeworkId, studentId: session.user.id },
  });

  if (attemptCount >= homework.maxAttempts) {
    return NextResponse.json({ error: "Max attempts reached" }, { status: 400 });
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  // Check deadline
  const now = new Date();
  const isLate = homework.dueDate ? homework.dueDate < now : false;
  if (isLate && !homework.allowLate) {
    return NextResponse.json({ error: "Deadline passed" }, { status: 400 });
  }
  const penalty = isLate ? homework.latePenalty : 0;

  // Save file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (path.extname(file.name) || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }
  const safeFilename = `${homeworkId}_${session.user.id}_${Date.now()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, safeFilename);

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(filePath, buffer);

  // Create submission + file in transaction
  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      const count = await tx.submission.count({
        where: { homeworkId, studentId: session.user.id },
      });

      if (count >= homework.maxAttempts) {
        throw new Error("MAX_ATTEMPTS_REACHED");
      }

      const sub = await tx.submission.create({
        data: {
          homeworkId,
          studentId: session.user.id,
          code: fileSubmissionPlaceholder(file.name),
          status: "PENDING",
          attemptNumber: count + 1,
          isLate,
          penalty,
          manualStatus: "PENDING",
          files: {
            create: {
              filename: file.name,
              path: filePath,
              mimeType: submissionMimeType(file.name),
              size: file.size,
            },
          },
        },
        include: {
          files: { select: { id: true, filename: true, size: true } },
        },
      });

      return sub;
    });
  } catch (error) {
    // Не оставляем осиротевший файл на диске
    await unlink(filePath).catch(() => {});
    if (error instanceof Error && error.message === "MAX_ATTEMPTS_REACHED") {
      return NextResponse.json({ error: "Max attempts reached" }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({
    success: true,
    submissionId: submission.id,
    attemptNumber: submission.attemptNumber,
    files: submission.files,
  });
}

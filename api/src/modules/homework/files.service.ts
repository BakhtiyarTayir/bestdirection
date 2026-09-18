import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { submissionFileHeaders } from "../../common/submission-files";

/** Перенесено из src/app/api/files/[fileId]/* в web. */
@Injectable()
export class FilesService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Файл работы: его вправе получить сам ученик, преподаватель курса и
   * администратор. Больше никто — это чужая работа, а не публичный файл.
   */
  async open(fileId: string, user: SessionUser, { download }: { download: boolean }) {
    const file = await this.prisma.submissionFile.findUnique({
      where: { id: fileId },
      include: {
        submission: {
          select: {
            studentId: true,
            homework: {
              select: { lesson: { select: { course: { select: { teacherId: true } } } } },
            },
          },
        },
      },
    });
    if (!file) throw new NotFoundException("fileNotFound");

    const isOwner = file.submission.studentId === user.id;
    const isTeacher = file.submission.homework.lesson.course.teacherId === user.id;
    const isAdmin = user.role === "ADMIN";
    if (!isOwner && !isTeacher && !isAdmin) throw new ForbiddenException("forbidden");

    // Размер берём с диска: в базе он мог разойтись с файлом
    const info = await stat(file.path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException("fileNotFound");

    return {
      stream: createReadStream(file.path),
      headers: submissionFileHeaders({ filename: file.filename, size: info.size }, { download }),
    };
  }
}

import { ForbiddenException, Injectable } from "@nestjs/common";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { LessonProgressDto } from "./dto/lesson.dto";

/** Прогресс ученика по урокам. Перенесено из src/actions/progress-actions.ts. */
@Injectable()
export class ProgressService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  private requireStudent(user: SessionUser) {
    if (user.role !== "STUDENT") throw new ForbiddenException("onlyStudents");
  }

  update(lessonId: string, data: LessonProgressDto, user: SessionUser) {
    this.requireStudent(user);
    return this.prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId: user.id, lessonId } },
      create: {
        studentId: user.id,
        lessonId,
        watchTime: data.watchTime,
        lastPosition: data.lastPosition,
      },
      update: { watchTime: data.watchTime, lastPosition: data.lastPosition },
    });
  }

  markComplete(lessonId: string, user: SessionUser) {
    this.requireStudent(user);
    return this.prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId: user.id, lessonId } },
      create: { studentId: user.id, lessonId, completedAt: new Date() },
      update: { completedAt: new Date() },
    });
  }

  async courseProgress(courseId: string, user: SessionUser) {
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, isPublished: true },
      select: { id: true },
    });
    if (lessons.length === 0) return { total: 0, completed: 0, percentage: 0 };

    const completed = await this.prisma.lessonProgress.count({
      where: {
        studentId: user.id,
        lessonId: { in: lessons.map((lesson) => lesson.id) },
        completedAt: { not: null },
      },
    });

    return {
      total: lessons.length,
      completed,
      percentage: Math.round((completed / lessons.length) * 100),
    };
  }

  /** Отметка присутствия: по ней считается «сейчас на сайте» в статистике. */
  async touchPresence(user: SessionUser) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
      select: { id: true },
    });
  }

  lessonProgress(lessonId: string, user: SessionUser) {
    return this.prisma.lessonProgress.findUnique({
      where: { studentId_lessonId: { studentId: user.id, lessonId } },
    });
  }
}

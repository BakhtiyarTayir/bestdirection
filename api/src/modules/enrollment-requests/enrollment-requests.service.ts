import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { botMessages } from "../../common/telegram/messages";
import { TelegramNotifyService } from "../../common/telegram/telegram-notify.service";

/**
 * Каталог курсов для ученика, самозапись и заявки на платные курсы.
 * Перенесено из src/actions/enrollment-request-actions.ts в web.
 */
@Injectable()
export class EnrollmentRequestsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly telegram: TelegramNotifyService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Каталог для ученика: опубликованные курсы с самозаписью (FREE/PAID)
   * и состояние самого ученика по каждому курсу.
   */
  async catalog(student: SessionUser) {
    const courses = await this.prisma.course.findMany({
      where: { isPublished: true, isTemplate: false, accessType: { in: ["FREE", "PAID"] } },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        coverImage: true,
        accessType: true,
        price: true,
        intakeSeats: true,
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { enrollments: true, lessons: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const [enrollments, requests] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { studentId: student.id }, select: { courseId: true } }),
      this.prisma.enrollmentRequest.findMany({
        where: { studentId: student.id },
        select: { courseId: true, status: true },
      }),
    ]);

    const enrolledIds = new Set(enrollments.map((e) => e.courseId));
    const requestByCourse = new Map(requests.map((r) => [r.courseId, r.status]));

    return courses.map((course) => ({
      ...course,
      isEnrolled: enrolledIds.has(course.id),
      myRequestStatus: requestByCourse.get(course.id) ?? null,
      seatsLeft:
        course.intakeSeats !== null ? Math.max(0, course.intakeSeats - course._count.enrollments) : null,
    }));
  }

  /** Самозапись на бесплатный курс. */
  async enrollInFreeCourse(courseId: string, student: SessionUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, slug: true, isPublished: true, accessType: true, intakeSeats: true },
    });
    if (!course || !course.isPublished || course.accessType !== "FREE") {
      throw new BadRequestException("courseNotAvailable");
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("alreadyEnrolled");

    try {
      await this.prisma.$transaction(async (tx) => {
        if (course.intakeSeats !== null) {
          const taken = await tx.enrollment.count({ where: { courseId } });
          if (taken >= course.intakeSeats) throw new Error("NO_SEATS_LEFT");
        }
        await tx.enrollment.create({ data: { studentId: student.id, courseId } });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NO_SEATS_LEFT") {
        throw new ConflictException("noSeatsLeft");
      }
      // Гонка на unique(studentId, courseId)
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        throw new ConflictException("alreadyEnrolled");
      }
      throw error;
    }

    await this.audit.record({
      userId: student.id,
      entityType: "Enrollment",
      entityId: `${student.id}:${courseId}`,
      action: "CREATE",
      metadata: { courseId, studentId: student.id, selfEnrolled: true },
    });

    return { courseSlug: course.slug };
  }

  /** Заявка на платный курс: подтверждает преподаватель или администратор. */
  async requestEnrollment(courseId: string, student: SessionUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        isPublished: true,
        accessType: true,
        teacher: { select: { telegramChatId: true } },
      },
    });
    if (!course || !course.isPublished || course.accessType !== "PAID") {
      throw new BadRequestException("courseNotAvailable");
    }

    const enrolled = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId } },
      select: { id: true },
    });
    if (enrolled) throw new ConflictException("alreadyEnrolled");

    const existing = await this.prisma.enrollmentRequest.findUnique({
      where: { courseId_studentId: { courseId, studentId: student.id } },
    });
    if (existing?.status === "PENDING") throw new ConflictException("alreadyRequested");
    if (existing?.status === "APPROVED") throw new ConflictException("alreadyEnrolled");

    const request = await this.prisma.enrollmentRequest.upsert({
      where: { courseId_studentId: { courseId, studentId: student.id } },
      create: { courseId, studentId: student.id },
      update: { status: "PENDING", reviewedById: null, reviewedAt: null },
    });

    await this.audit.record({
      userId: student.id,
      entityType: "EnrollmentRequest",
      entityId: request.id,
      action: existing ? "UPDATE" : "CREATE",
      metadata: { courseId, studentId: student.id, resubmitted: Boolean(existing) },
    });

    const profile = await this.prisma.user.findUnique({
      where: { id: student.id },
      select: { firstName: true, lastName: true, phone: true },
    });
    await this.telegram.send(
      course.teacher.telegramChatId,
      botMessages.newEnrollmentRequest(
        course.title,
        `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim(),
        profile?.phone
      )
    );
  }

  /** Заявки: преподавателю — по своим курсам, администратору — все. */
  async list(user: SessionUser) {
    const where = user.role === "TEACHER" ? { course: { teacherId: user.id } } : {};

    const requests = await this.prisma.enrollmentRequest.findMany({
      where,
      include: {
        course: { select: { id: true, title: true, slug: true, price: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            telegramUsername: true,
          },
        },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // PENDING всегда сверху, затем решённые по дате
    const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 } as const;
    requests.sort(
      (a, b) => order[a.status] - order[b.status] || b.createdAt.getTime() - a.createdAt.getTime()
    );
    return requests;
  }

  async pendingCount(user: SessionUser) {
    const where =
      user.role === "TEACHER"
        ? { status: "PENDING" as const, course: { teacherId: user.id } }
        : { status: "PENDING" as const };
    return { count: await this.prisma.enrollmentRequest.count({ where }) };
  }

  async approve(requestId: string, actor: SessionUser) {
    const request = await this.findForReview(requestId, actor);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (request.course.intakeSeats !== null) {
          const taken = await tx.enrollment.count({ where: { courseId: request.courseId } });
          if (taken >= request.course.intakeSeats) throw new Error("NO_SEATS_LEFT");
        }
        await tx.enrollment.create({
          data: { studentId: request.studentId, courseId: request.courseId },
        });
        await tx.enrollmentRequest.update({
          where: { id: request.id },
          data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date() },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NO_SEATS_LEFT") {
        throw new ConflictException("noSeatsLeft");
      }
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        throw new ConflictException("alreadyEnrolled");
      }
      throw error;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "EnrollmentRequest",
      entityId: request.id,
      action: "UPDATE",
      changes: { status: { old: "PENDING", new: "APPROVED" } },
      metadata: { courseId: request.courseId, studentId: request.studentId },
    });

    await this.telegram.send(
      request.student.telegramChatId,
      botMessages.enrollmentApproved(request.course.title)
    );
  }

  async reject(requestId: string, actor: SessionUser) {
    const request = await this.findForReview(requestId, actor);

    await this.prisma.enrollmentRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date() },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "EnrollmentRequest",
      entityId: request.id,
      action: "UPDATE",
      changes: { status: { old: "PENDING", new: "REJECTED" } },
      metadata: { courseId: request.courseId, studentId: request.studentId },
    });

    await this.telegram.send(
      request.student.telegramChatId,
      botMessages.enrollmentRejected(request.course.title)
    );
  }

  /** Заявка, которую вызывающий вправе рассмотреть. */
  private async findForReview(requestId: string, actor: SessionUser) {
    const request = await this.prisma.enrollmentRequest.findUnique({
      where: { id: requestId },
      include: {
        course: { select: { id: true, title: true, teacherId: true, intakeSeats: true } },
        student: { select: { id: true, telegramChatId: true } },
      },
    });

    // Чужая заявка — 404, а не 403: ответ не подтверждает, что она есть
    if (!request) throw new NotFoundException("requestNotFound");
    if (actor.role === "TEACHER" && request.course.teacherId !== actor.id) {
      throw new NotFoundException("requestNotFound");
    }
    if (request.status !== "PENDING") throw new ConflictException("alreadyReviewed");
    return request;
  }
}

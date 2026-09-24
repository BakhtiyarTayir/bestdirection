import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { SubmitLeadDto } from "./dto/marketing.dto";

/** Заявки с лендинга. Перенесено из src/actions/lead-actions.ts в web. */
@Injectable()
export class LeadsService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Заявка с публичной формы. Ловушка для ботов: заполненное скрытое поле
   * website — молча отвечаем успехом, чтобы бот не научился его пропускать.
   */
  async submit(data: SubmitLeadDto) {
    if (data.website) return { ok: true as const };

    // Курс берём из контента лендинга: заявка не привязана к курсу платформы,
    // название хранится строкой
    const course = await this.prisma.marketingCourse.findFirst({
      where: { slug: data.courseSlug, published: true },
      select: { title: true },
    });
    if (!course) throw new NotFoundException("courseNotFound");

    await this.prisma.courseLead.create({
      data: {
        courseName: course.title,
        fullName: data.fullName,
        phone: data.phone,
        message: data.message,
      },
    });

    return { ok: true as const };
  }

  list() {
    return this.prisma.courseLead.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        phone: true,
        message: true,
        contacted: true,
        createdAt: true,
        courseName: true,
      },
    });
  }

  async uncontactedCount() {
    return { count: await this.prisma.courseLead.count({ where: { contacted: false } }) };
  }

  async markContacted(id: string, contacted: boolean) {
    const lead = await this.prisma.courseLead.findUnique({ where: { id }, select: { id: true } });
    if (!lead) throw new NotFoundException("leadNotFound");

    return this.prisma.courseLead.update({ where: { id }, data: { contacted } });
  }
}

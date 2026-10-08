import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { currentDateKey } from "../billing/domain/billing";
import { hostingDaysLeft, HOSTING_WARN_DAYS } from "./domain/hosting";

const HOSTING_PAID_UNTIL_KEY = "hostingPaidUntil";
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Срок оплаты VPS. Сервер арендует разработчик на своём аккаунте у
 * провайдера, сам сервер срока не знает — дату вносят руками. Менять её
 * может только он: id задаёт HOSTING_OWNER_ID, у остальных администраторов
 * поле только для чтения — они видят лишь плашку за 10 дней до срока.
 */
@Injectable()
export class HostingService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  private isOwner(actor: SessionUser): boolean {
    const ownerId = process.env.HOSTING_OWNER_ID?.trim();
    return Boolean(ownerId) && actor.id === ownerId;
  }

  async status(actor: SessionUser) {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: HOSTING_PAID_UNTIL_KEY } });
    const paidUntil = row?.value && DATE_KEY.test(row.value) ? row.value : null;
    const daysLeft = paidUntil ? hostingDaysLeft(paidUntil, currentDateKey()) : null;
    return {
      paidUntil,
      daysLeft,
      warn: daysLeft !== null && daysLeft <= HOSTING_WARN_DAYS,
      canEdit: this.isOwner(actor),
    };
  }

  async setPaidUntil(paidUntil: string, actor: SessionUser) {
    if (!this.isOwner(actor)) throw new ForbiddenException("forbidden");
    if (!DATE_KEY.test(paidUntil) || Number.isNaN(Date.parse(`${paidUntil}T00:00:00Z`))) {
      throw new BadRequestException("invalidDate");
    }

    await this.prisma.siteSetting.upsert({
      where: { key: HOSTING_PAID_UNTIL_KEY },
      create: { key: HOSTING_PAID_UNTIL_KEY, value: paidUntil },
      update: { value: paidUntil },
    });
    await this.audit.record({
      userId: actor.id,
      entityType: "SiteSetting",
      entityId: HOSTING_PAID_UNTIL_KEY,
      action: "UPDATE",
      metadata: { value: paidUntil },
    });
    return this.status(actor);
  }
}

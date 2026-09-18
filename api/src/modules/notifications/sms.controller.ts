import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser, Public, Webhook } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { BroadcastDto, CreateTemplateDto, LogQueryDto } from "./dto/sms.dto";
import { SmsService } from "./sms.service";

/**
 * Рассылки и журнал СМС. Всё, кроме приёма статусов доставки, — только
 * администратору: сообщения стоят денег.
 */
@Controller("sms")
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get("account")
  account() {
    return this.sms.account();
  }

  // Шаблоны видит и преподаватель: по ним он понимает, что уйдёт родителям
  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("templates")
  templates() {
    return this.sms.templates();
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("templates")
  createTemplate(@Body() body: CreateTemplateDto, @CurrentUser() actor: SessionUser) {
    return this.sms.createTemplate(body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("templates/sync")
  syncTemplates(@CurrentUser() actor: SessionUser) {
    return this.sms.syncTemplates(actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("broadcast/preview")
  preview(@Body() body: BroadcastDto) {
    return this.sms.previewBroadcast(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("broadcast")
  send(@Body() body: BroadcastDto, @CurrentUser() actor: SessionUser) {
    return this.sms.sendBroadcast(body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get("log")
  log(@Query() query: LogQueryDto) {
    return this.sms.log(query.limit);
  }

  /**
   * Статусы доставки от Eskiz. Адрес закрыт секретом в пути (аудит 2.7):
   * раньше кто угодно мог переписать статусы в журнале, за который платят.
   * Ответ всегда 200 — на 4xx шлюз бесконечно повторяет доставку.
   */
  @Public()
  @Webhook()
  @Post("callback/:secret")
  async callback(@Param("secret") secret: string, @Body() body: Record<string, unknown>) {
    if (secret !== this.sms.callbackSecret()) return { ok: false };

    try {
      return await this.sms.applyDeliveryStatus(body as never);
    } catch {
      return { ok: false };
    }
  }
}

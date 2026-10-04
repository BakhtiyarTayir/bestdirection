import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { BotError, webhookCallback } from "grammy";
import { Public, Webhook } from "../../common/auth/decorators";
import { TelegramBotService } from "./telegram-bot.service";

/** Приём обновлений от Telegram. Перенесено из src/app/api/telegram/webhook в web. */
@Controller("telegram")
export class TelegramController {
  constructor(private readonly bot: TelegramBotService) {}

  @Public()
  @Webhook()
  @Post("webhook")
  async webhook(@Req() request: Request, @Res() response: Response) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!this.bot.isConfigured() || !secret) {
      response.status(503).json({ error: "Bot not configured" });
      return;
    }

    if (request.header("x-telegram-bot-api-secret-token") !== secret) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      await webhookCallback(this.bot.getBot(), "express")(request, response);
    } catch (error) {
      // Отвечаем 200 даже при ошибке: bot.catch в grammY не действует в
      // режиме webhook, а 500 заставит Telegram бесконечно повторять
      // обновление, и очередь бота встанет.
      // Только текст ошибки: объект BotError несёт контекст с токеном бота.
      const cause = error instanceof BotError ? error.error : error;
      console.error(
        "Ошибка вебхука Telegram:",
        cause instanceof Error ? cause.message : String(cause),
      );
      if (!response.headersSent) response.json({ ok: true });
    }
  }
}

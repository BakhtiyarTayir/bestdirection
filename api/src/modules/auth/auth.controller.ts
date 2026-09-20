import { Body, Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Authenticated, CurrentUser, Public } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { AuthService } from "./auth.service";
import {
  LoginDto,
  RequestTelegramPasswordResetDto,
  ResetPasswordViaTelegramDto,
  TelegramCodeDto,
  TelegramWidgetDto,
} from "./dto/auth.dto";
import { SESSION_COOKIE, SessionsService } from "../../common/auth/sessions.service";

class StatusQueryDto extends createZodDto(z.object({ code: z.string().max(64) })) {}

/**
 * Сколько попыток входа с адреса в минуту. Значение из окружения нужно
 * тестам: они делают десятки входов подряд, а в проде предел остаётся
 * прежним.
 */
const LOGIN_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 10);
const CODE_LIMIT = Number(process.env.AUTH_CODE_RATE_LIMIT ?? 5);

/**
 * Вход и восстановление пароля. Самостоятельная регистрация и почтовый
 * сброс убраны на шаге 2 отказа от почты: учеников заводит администратор,
 * Telegram — единственный самостоятельный путь восстановления.
 *
 * Пределы частоты жёстче общих: это единственные маршруты, куда стучатся до
 * входа. Прежний лимитер опирался на Upstash, которого в проде нет, и не
 * работал (аудит 7.1); здесь счётчик живёт в памяти процесса.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService
  ) {}

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("login")
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.loginWithPassword(body, this.contextOf(request));
    this.sessions.setCookie(response, result.token);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("telegram/widget")
  async telegramWidget(
    @Body() body: TelegramWidgetDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.auth.loginWithTelegramWidget(body, this.contextOf(request));
    this.sessions.setCookie(response, result.token);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("telegram/code")
  async telegramCode(
    @Body() body: TelegramCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.auth.loginWithTelegramCode(body.code, this.contextOf(request));
    this.sessions.setCookie(response, result.token);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("telegram/request")
  telegramRequest() {
    return this.auth.createTelegramLoginRequest();
  }

  /**
   * Имя бота для кнопки входа. Отдаём с сервера: в сборку web оно не
   * попадает — образ собирается из git-архива без .env.
   */
  @Public()
  @Get("telegram/bot")
  telegramBot() {
    return {
      username:
        process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null,
    };
  }

  /** Страница входа опрашивает статус, пока идёт подтверждение в чате. */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get("telegram/status")
  telegramStatus(@Query() query: StatusQueryDto) {
    return this.auth.telegramLoginStatus(query.code);
  }

  @Authenticated()
  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[SESSION_COOKIE]);
    this.sessions.clearCookie(response);
    return { ok: true };
  }

  @Authenticated()
  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  /**
   * Сброс пароля кодом в Telegram — единственный самостоятельный путь после
   * ухода почты (шаг 2 отказа от почты). Работает, только если у логина
   * привязан Telegram — иначе нейтральный { ok: true }, чтобы форма не
   * превращалась в перебор логинов.
   */
  @Public()
  @Throttle({ default: { limit: CODE_LIMIT, ttl: 60_000 } })
  @Post("password/telegram/request-code")
  requestTelegramReset(@Body() body: RequestTelegramPasswordResetDto) {
    return this.auth.requestTelegramPasswordReset(body);
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("password/telegram/reset")
  resetPasswordViaTelegram(@Body() body: ResetPasswordViaTelegramDto) {
    return this.auth.resetPasswordViaTelegram(body);
  }

  private contextOf(request: Request) {
    return {
      userAgent: request.header("user-agent") ?? undefined,
      // За Caddy настоящий адрес приходит заголовком
      ip: (request.header("x-forwarded-for") ?? request.ip ?? "").split(",")[0].trim() || undefined,
    };
  }
}

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
  RegisterDto,
  RequestEmailDto,
  ResetPasswordDto,
  TelegramCodeDto,
  TelegramWidgetDto,
  VerifyCodeDto,
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
 * Вход, регистрация и восстановление пароля.
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

  @Public()
  @Throttle({ default: { limit: CODE_LIMIT, ttl: 60_000 } })
  @Post("email/request-code")
  requestEmailCode(@Body() body: RequestEmailDto) {
    return this.auth.requestEmailVerification(body);
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("email/verify-code")
  verifyEmailCode(@Body() body: VerifyCodeDto) {
    return this.auth.verifyEmailCode(body);
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Public()
  @Throttle({ default: { limit: CODE_LIMIT, ttl: 60_000 } })
  @Post("password/request-reset")
  requestReset(@Body() body: RequestEmailDto) {
    return this.auth.requestPasswordReset(body);
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post("password/reset")
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body);
  }

  private contextOf(request: Request) {
    return {
      userAgent: request.header("user-agent") ?? undefined,
      // За Caddy настоящий адрес приходит заголовком
      ip: (request.header("x-forwarded-for") ?? request.ip ?? "").split(",")[0].trim() || undefined,
    };
  }
}

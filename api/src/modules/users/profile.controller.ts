import { Body, Controller, Delete, Get, Patch, Post } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { ChangePasswordDto, UpdateProfileDto } from "./dto/user.dto";
import { TelegramLinkService } from "./telegram-link.service";
import { UsersService } from "./users.service";

/** Что человек делает только с собой: @Authenticated(), без прав на объект. */
@Controller("me")
export class ProfileController {
  constructor(
    private readonly users: UsersService,
    private readonly telegram: TelegramLinkService
  ) {}

  @Authenticated()
  @Patch("profile")
  updateProfile(@Body() body: UpdateProfileDto, @CurrentUser() user: SessionUser) {
    return this.users.updateProfile(user.id, body);
  }

  @Authenticated()
  @Post("password")
  async changePassword(@Body() body: ChangePasswordDto, @CurrentUser() user: SessionUser) {
    await this.users.changePassword(user.id, body);
    return { ok: true };
  }

  @Authenticated()
  @Get("telegram")
  telegramStatus(@CurrentUser() user: SessionUser) {
    return this.telegram.status(user.id);
  }

  @Authenticated()
  @Post("telegram/code")
  telegramCode(@CurrentUser() user: SessionUser) {
    return this.telegram.createCode(user.id);
  }

  @Authenticated()
  @Delete("telegram")
  async telegramUnlink(@CurrentUser() user: SessionUser) {
    await this.telegram.unlink(user.id);
    return { ok: true };
  }
}

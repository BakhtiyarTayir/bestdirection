import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import {
  CreateUserDto,
  HomeworkStatisticsQueryDto,
  LoginAvailableQueryDto,
  LoginSuggestionDto,
  UpdateUserDto,
  UsersQueryDto,
} from "./dto/user.dto";
import { HomeworkStatisticsService } from "./homework-statistics.service";
import { TelegramInviteService } from "./telegram-invite.service";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly statistics: HomeworkStatisticsService,
    private readonly telegramInvites: TelegramInviteService
  ) {}

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get()
  list(@CurrentAbility() ability: AppAbility, @Query() query: UsersQueryDto) {
    return this.users.list(ability, query.branchId);
  }

  @CheckPolicies((ability) => ability.can("manage", "User"))
  @Get("teachers")
  teachers() {
    return this.users.teachers();
  }

  @CheckPolicies((ability) => ability.can("manage", "User"))
  @Get("deactivated")
  deactivated() {
    return this.users.deactivated();
  }

  // Цифра «новые пользователи» в меню. До @Get(":id") — иначе Nest примет
  // "new" за id пользователя
  @CheckPolicies((ability) => ability.can("manage", "User"))
  @Get("new/count")
  newUsersCount(@CurrentUser() actor: SessionUser) {
    return this.users.newUsersCount(actor);
  }

  /** Администратор открыл список — цифра обнуляется. */
  @CheckPolicies((ability) => ability.can("manage", "User"))
  @Post("new/seen")
  async markUsersSeen(@CurrentUser() actor: SessionUser) {
    await this.users.markUsersSeen(actor);
    return { ok: true };
  }

  // Три следующих маршрута обслуживают форму создания пользователя (тот же
  // доступ, что у самого создания) и ДОЛЖНЫ стоять до @Get(":id") — иначе
  // Nest примет "login-available"/"form-options" за значение :id
  @CheckPolicies((ability) => ability.can("create", "User"))
  @Post("login-suggestion")
  loginSuggestion(@Body() body: LoginSuggestionDto) {
    return this.users.suggestLogin(body.firstName, body.lastName);
  }

  @CheckPolicies((ability) => ability.can("create", "User"))
  @Get("login-available")
  loginAvailable(@Query() query: LoginAvailableQueryDto) {
    return this.users.loginAvailable(query.login);
  }

  @CheckPolicies((ability) => ability.can("create", "User"))
  @Get("form-options")
  formOptions() {
    return this.users.formOptionsForCreate();
  }

  @CheckPolicies((ability) => ability.can("read", "HomeworkStatistics"))
  @Get("statistics/homework")
  homeworkStatistics(@Query() query: HomeworkStatisticsQueryDto, @CurrentUser() user: SessionUser) {
    return this.statistics.build(query, user);
  }

  @CheckPolicies((ability) => ability.can("read", "User"))
  @Get(":id")
  byId(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.users.byId(ability, id);
  }

  @CheckPolicies((ability) => ability.can("create", "User"))
  @Post()
  create(@Body() body: CreateUserDto, @CurrentUser() actor: SessionUser) {
    return this.users.create(body, actor);
  }

  @CheckPolicies((ability) => ability.can("update", "User"))
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateUserDto, @CurrentUser() actor: SessionUser) {
    return this.users.update(id, body, actor);
  }

  @CheckPolicies((ability) => ability.can("update", "User"))
  @Post(":id/deactivate")
  async deactivate(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.users.deactivate(id, actor);
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("update", "User"))
  @Post(":id/restore")
  async restore(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.users.restore(id, actor);
    return { ok: true };
  }

  /** Ссылка-приглашение в Telegram: копировать или показать QR-кодом. */
  @CheckPolicies((ability) => ability.can("manage", "User"))
  @Post(":id/telegram-invite")
  telegramInvite(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.telegramInvites.createInvite(id, actor);
  }

  /** Та же ссылка + отправка по SMS на телефон из карточки. */
  @CheckPolicies((ability) => ability.can("manage", "User"))
  @Post(":id/telegram-invite/sms")
  telegramInviteSms(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.telegramInvites.sendInviteSms(id, actor);
  }

  /** Окончательное удаление строки — только с вкладки деактивированных. */
  @CheckPolicies((ability) => ability.can("delete", "User"))
  @Delete(":id")
  async purge(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.users.purge(id, actor);
    return { ok: true };
  }
}

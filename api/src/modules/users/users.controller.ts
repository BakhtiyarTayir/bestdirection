import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { CreateUserDto, HomeworkStatisticsQueryDto, UpdateUserDto, UsersQueryDto } from "./dto/user.dto";
import { HomeworkStatisticsService } from "./homework-statistics.service";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly statistics: HomeworkStatisticsService
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

  /** Окончательное удаление строки — только с вкладки деактивированных. */
  @CheckPolicies((ability) => ability.can("delete", "User"))
  @Delete(":id")
  async purge(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.users.purge(id, actor);
    return { ok: true };
  }
}

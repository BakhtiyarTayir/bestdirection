import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import {
  CreateParentDto,
  GroupQueryDto,
  LinkParentDto,
  ParentQueryDto,
  SearchQueryDto,
  StudentQueryDto,
  UpdateLinkDto,
} from "./dto/parent.dto";
import { ParentsService } from "./parents.service";

@Controller("parents")
export class ParentsController {
  constructor(private readonly parents: ParentsService) {}

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("by-student")
  byStudent(@Query() query: StudentQueryDto) {
    return this.parents.byStudent(query.studentId);
  }

  /** Кабинет родителя: без аргумента — свои дети. Чужую семью сервис не отдаст. */
  @Authenticated()
  @Get("children")
  children(@Query() query: ParentQueryDto, @CurrentUser() user: SessionUser) {
    return this.parents.children(query.parentId, user);
  }

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("candidates")
  candidates(@Query() query: SearchQueryDto) {
    return this.parents.searchCandidates(query.query);
  }

  /** Получатели рассылки по группе. */
  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("group-recipients")
  groupRecipients(@Query() query: GroupQueryDto) {
    return this.parents.groupRecipients(query.groupId);
  }

  @CheckPolicies((ability) => ability.can("manage", "ParentLink"))
  @Post("links")
  link(@Body() body: LinkParentDto, @CurrentUser() actor: SessionUser) {
    return this.parents.link(body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "ParentLink"))
  @Post()
  create(@Body() body: CreateParentDto, @CurrentUser() actor: SessionUser) {
    return this.parents.createForStudent(body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "ParentLink"))
  @Patch("links/:id")
  updateLink(@Param("id") id: string, @Body() body: UpdateLinkDto, @CurrentUser() actor: SessionUser) {
    return this.parents.updateLink(id, body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "ParentLink"))
  @Delete("links/:id")
  unlink(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.parents.unlink(id, actor);
  }
}

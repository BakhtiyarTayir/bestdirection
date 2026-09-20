import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { BranchesService } from "./branches.service";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";

// Читает справочник весь персонал (нужно показать название филиала группы
// в списках), а меняет — только ADMIN через "manage" (решение владельца:
// отдельной роли «администратор филиала» пока нет).
@Controller("branches")
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @CheckPolicies((ability) => ability.can("read", "Branch"))
  @Get()
  all() {
    return this.branches.all();
  }

  @CheckPolicies((ability) => ability.can("manage", "Branch"))
  @Post()
  create(@Body() body: CreateBranchDto, @CurrentUser() actor: SessionUser) {
    return this.branches.create(body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "Branch"))
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateBranchDto, @CurrentUser() actor: SessionUser) {
    return this.branches.update(id, body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "Branch"))
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.branches.remove(id, actor);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import type { AppAbility } from "../../common/policies/abilities";
import {
  CreatePayoutDto,
  GroupStudentsQueryDto,
  PayoutFiltersDto,
  RecalcQueryDto,
  SalaryOverviewQueryDto,
  SetManualAmountDto,
  TeacherSalaryQueryDto,
} from "./dto/salary.dto";
import { PayoutsService } from "./payouts.service";
import { SalaryService } from "./salary.service";

// Деньги для персонала видит и правит только администратор — сводка, разбивка
// по преподавателю и журнал выплат. Своя зарплата (GET /salary/me) доступна
// любому, у кого есть право read Salary — сужение до себя делает сервис.
const adminOnly = (ability: AppAbility) => ability.can("manage", "Salary");
const canReadOwn = (ability: AppAbility) => ability.can("read", "Salary");

@Controller("salary")
export class SalaryController {
  constructor(
    private readonly salary: SalaryService,
    private readonly payouts: PayoutsService
  ) {}

  @CheckPolicies(adminOnly)
  @Get()
  overview(@Query() query: SalaryOverviewQueryDto, @CurrentUser() actor: SessionUser) {
    return this.salary.overview(query, actor);
  }

  /**
   * Своя зарплата. Путь идёт ДО ":teacherId" — иначе Nest принял бы "me" за
   * id преподавателя и увёл запрос не в тот обработчик.
   */
  @CheckPolicies(canReadOwn)
  @Get("me")
  me(@Query() query: TeacherSalaryQueryDto, @CurrentUser() actor: SessionUser) {
    return this.salary.teacherDetail(actor.id, query, actor);
  }

  /** Ученики группы за месяц: начислено и поступило. Только администратор; ДО ":teacherId". */
  @CheckPolicies(adminOnly)
  @Get("group-students")
  groupStudents(@Query() query: GroupStudentsQueryDto) {
    return this.salary.groupStudents(query);
  }

  @CheckPolicies(adminOnly)
  @Get("payouts")
  payoutsList(@Query() query: PayoutFiltersDto) {
    return this.payouts.list(query);
  }

  @CheckPolicies(adminOnly)
  @Get("payouts/teachers")
  payoutTeacherOptions() {
    return this.payouts.teacherOptions();
  }

  @CheckPolicies(adminOnly)
  @Post("payouts")
  createPayout(@Body() body: CreatePayoutDto, @CurrentUser() actor: SessionUser) {
    return this.payouts.create(body, actor);
  }

  @CheckPolicies(adminOnly)
  @Delete("payouts/:id")
  async deletePayout(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.payouts.remove(id, actor);
    return { ok: true };
  }

  @CheckPolicies(adminOnly)
  @Patch("accruals/:id")
  setManualAmount(
    @Param("id") id: string,
    @Body() body: SetManualAmountDto,
    @CurrentUser() actor: SessionUser
  ) {
    return this.salary.setManualAmount(id, body.manualAmount, actor);
  }

  // TEACHER видит только себя — сужение делает сервис (teacherDetail), права
  // здесь только различают «может читать вообще что-то из Salary»
  @CheckPolicies(canReadOwn)
  @Get(":teacherId")
  teacherDetail(
    @Param("teacherId") teacherId: string,
    @Query() query: TeacherSalaryQueryDto,
    @CurrentUser() actor: SessionUser
  ) {
    return this.salary.teacherDetail(teacherId, query, actor);
  }

  @CheckPolicies(adminOnly)
  @Post(":teacherId/recalc")
  recalculate(
    @Param("teacherId") teacherId: string,
    @Query() query: RecalcQueryDto,
    @CurrentUser() actor: SessionUser
  ) {
    return this.salary.recalculateMonth(teacherId, query, actor);
  }
}

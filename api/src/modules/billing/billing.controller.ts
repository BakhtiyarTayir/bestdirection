import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { BillingService } from "./billing.service";
import {
  CreatePaymentDto,
  DebtorsExportQueryDto,
  DebtorsQueryDto,
  MonthQueryDto,
  PaymentFiltersDto,
  StudentsQueryDto,
  UpdateEnrollmentBillingDto,
} from "./dto/billing.dto";
import { PaymentsService } from "./payments.service";

// Деньги видит и правит только администратор: правило одно на весь модуль.
const adminOnly = (ability: { can: (action: "manage", subject: "Billing") => boolean }) =>
  ability.can("manage", "Billing");

@Controller("billing")
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payments: PaymentsService
  ) {}

  @CheckPolicies(adminOnly)
  @Get("debtors")
  debtors(@Query() query: DebtorsQueryDto) {
    return this.billing.debtors(query);
  }

  /** Excel со списком должников; фильтры те же, что у экрана. До debtors/:param. */
  @CheckPolicies(adminOnly)
  @Get("debtors/export")
  async exportDebtors(@Query() query: DebtorsExportQueryDto, @Res() res: Response) {
    const file = await this.billing.exportDebtors(query);
    // Имя файла по RFC 5987, как в выгрузках тестов
    res
      .status(200)
      .setHeader("Content-Type", file.contentType)
      .setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
      .send(file.body);
  }

  /** Бейдж в сайдбаре. */
  @CheckPolicies(adminOnly)
  @Get("debtors/count")
  debtorsCount() {
    return this.billing.debtorsCount();
  }

  @CheckPolicies(adminOnly)
  @Get("students")
  studentsOverview(@Query() query: StudentsQueryDto) {
    return this.billing.studentsOverview(query);
  }

  @CheckPolicies(adminOnly)
  @Get("students/:studentId")
  studentBilling(@Param("studentId") studentId: string) {
    return this.billing.studentBilling(studentId);
  }

  @CheckPolicies(adminOnly)
  @Get("enrollments/:enrollmentId")
  enrollmentBilling(@Param("enrollmentId") enrollmentId: string) {
    return this.billing.enrollmentBilling(enrollmentId);
  }

  @CheckPolicies(adminOnly)
  @Patch("enrollments/:enrollmentId")
  async updateEnrollmentBilling(
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: UpdateEnrollmentBillingDto,
    @CurrentUser() actor: SessionUser
  ) {
    await this.billing.updateEnrollmentBilling(enrollmentId, body, actor);
    return { ok: true };
  }

  @CheckPolicies(adminOnly)
  @Get("enrollments/:enrollmentId/recalc")
  previewRecalc(@Param("enrollmentId") enrollmentId: string, @Query() query: MonthQueryDto) {
    return this.billing.previewMonthRecalc(enrollmentId, query.month);
  }

  @CheckPolicies(adminOnly)
  @Post("enrollments/:enrollmentId/recalc")
  recalculate(
    @Param("enrollmentId") enrollmentId: string,
    @Query() query: MonthQueryDto,
    @CurrentUser() actor: SessionUser
  ) {
    return this.billing.recalculateMonth(enrollmentId, query.month, actor);
  }

  @CheckPolicies(adminOnly)
  @Get("payments")
  payments_(@Query() query: PaymentFiltersDto) {
    return this.payments.list(query);
  }

  @CheckPolicies(adminOnly)
  @Get("payments/form-options")
  paymentFormOptions() {
    return this.payments.formOptions();
  }

  @CheckPolicies(adminOnly)
  @Post("payments")
  createPayment(@Body() body: CreatePaymentDto, @CurrentUser() actor: SessionUser) {
    return this.payments.create(body, actor);
  }

  @CheckPolicies(adminOnly)
  @Delete("payments/:id")
  async deletePayment(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.payments.remove(id, actor);
    return { ok: true };
  }
}

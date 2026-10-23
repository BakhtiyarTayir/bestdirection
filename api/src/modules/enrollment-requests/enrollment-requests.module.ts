import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { EnrollmentRequestsController } from "./enrollment-requests.controller";
import { EnrollmentRequestsService } from "./enrollment-requests.service";

// BillingModule: возобновление отчисленной записи (та же пара studentId,
// courseId) обязано сначала заморозить закрытые месяцы, как и везде, где
// снимается billingEndsAt. SalaryModule — то же для зарплаты прежней группы
// отчисленного (его вклад держится на unenrolledFromGroupId, который сбрасывается).
@Module({
  imports: [BillingModule, SalaryModule],
  controllers: [EnrollmentRequestsController],
  providers: [EnrollmentRequestsService],
})
export class EnrollmentRequestsModule {}

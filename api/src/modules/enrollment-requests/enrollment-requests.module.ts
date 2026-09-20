import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { EnrollmentRequestsController } from "./enrollment-requests.controller";
import { EnrollmentRequestsService } from "./enrollment-requests.service";

// BillingModule: возобновление отчисленной записи (та же пара studentId,
// courseId) обязано сначала заморозить закрытые месяцы, как и везде, где
// снимается billingEndsAt.
@Module({
  imports: [BillingModule],
  controllers: [EnrollmentRequestsController],
  providers: [EnrollmentRequestsService],
})
export class EnrollmentRequestsModule {}

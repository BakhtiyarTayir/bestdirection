import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingLedgerService } from "./billing-ledger.service";
import { BillingService } from "./billing.service";
import { PaymentsService } from "./payments.service";

// Начисления, долги и оплаты. Реестр (BillingLedgerService) экспортируется:
// курсам и группам он нужен, чтобы заморозить закрытые месяцы перед сменой цены.
// BillingService экспортируется тоже: дашборду ученика/родителя нужна
// studentBilling — считать баланс своим кодом ему нельзя (правило 0 плана
// дашборда), а заводить обёртку поверх сервиса ради одного метода незачем.
@Module({
  controllers: [BillingController],
  providers: [BillingLedgerService, BillingService, PaymentsService],
  exports: [BillingLedgerService, BillingService],
})
export class BillingModule {}

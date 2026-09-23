import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingLedgerService } from "./billing-ledger.service";
import { BillingService } from "./billing.service";
import { PaymentsService } from "./payments.service";

// Начисления, долги и оплаты. Реестр (BillingLedgerService) экспортируется:
// курсам и группам он нужен, чтобы заморозить закрытые месяцы перед сменой цены.
// BillingService экспортируется отдельно: главной панели нужны debtors()
// (карточка долга учеников у администратора) и studentBilling() (баланс
// ученика и родителя) — пересчитывать деньги своим кодом дашборду нельзя.
@Module({
  controllers: [BillingController],
  providers: [BillingLedgerService, BillingService, PaymentsService],
  exports: [BillingLedgerService, BillingService],
})
export class BillingModule {}

import { Module } from "@nestjs/common";
import { BillingLedgerService } from "./billing-ledger.service";

// Пока только расчётная часть: реестр начислений нужен курсам и группам —
// смена цены обязана заморозить закрытые месяцы до записи.
@Module({
  providers: [BillingLedgerService],
  exports: [BillingLedgerService],
})
export class BillingModule {}

import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { MarketingController } from "./marketing.controller";
import { MarketingService } from "./marketing.service";

@Module({
  controllers: [MarketingController, LeadsController],
  providers: [MarketingService, LeadsService],
})
export class MarketingModule {}

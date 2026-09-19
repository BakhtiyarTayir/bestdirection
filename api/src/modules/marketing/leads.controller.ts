import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/auth/decorators";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { LeadContactedDto, SubmitLeadDto } from "./dto/marketing.dto";
import { LeadsService } from "./leads.service";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /**
   * Публичная форма заявки. Ограничение частоты — пять заявок в минуту с
   * адреса: раньше оно опиралось на Upstash, которого в проде нет, и не
   * работало вовсе (аудит 7.1). Здесь счётчик живёт в памяти процесса.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  submit(@Body() body: SubmitLeadDto) {
    return this.leads.submit(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get()
  list() {
    return this.leads.list();
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Patch(":id")
  markContacted(@Param("id") id: string, @Body() body: LeadContactedDto) {
    return this.leads.markContacted(id, body.contacted);
  }
}

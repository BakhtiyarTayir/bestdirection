import { Global, Module } from "@nestjs/common";
import { AbilityFactory } from "../policies/abilities";
import { SessionsService } from "./sessions.service";
import { SessionUserCache } from "./session-user.cache";

@Global()
@Module({
  providers: [SessionUserCache, AbilityFactory, SessionsService],
  exports: [SessionUserCache, AbilityFactory, SessionsService],
})
export class AuthModule {}

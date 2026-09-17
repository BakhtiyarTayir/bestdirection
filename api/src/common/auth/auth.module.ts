import { Global, Module } from "@nestjs/common";
import { AbilityFactory } from "../policies/abilities";
import { SessionUserCache } from "./session-user.cache";

@Global()
@Module({
  providers: [SessionUserCache, AbilityFactory],
  exports: [SessionUserCache, AbilityFactory],
})
export class AuthModule {}

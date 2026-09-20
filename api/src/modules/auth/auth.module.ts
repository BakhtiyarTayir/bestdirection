import { Module } from "@nestjs/common";
import { EmailService } from "../../common/email/email.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, EmailService],
})
export class AuthModule {}

import { Module } from "@nestjs/common";
import { EskizService } from "../../common/sms/eskiz.service";
import { HomeworkModule } from "../homework/homework.module";
import { ParentsModule } from "../parents/parents.module";
import { SmsController } from "./sms.controller";
import { SmsService } from "./sms.service";
import { TelegramBotService } from "./telegram-bot.service";
import { TelegramController } from "./telegram.controller";

@Module({
  // Бот заводит работы тем же сервисом, что и кабинет
  imports: [ParentsModule, HomeworkModule],
  controllers: [SmsController, TelegramController],
  providers: [SmsService, EskizService, TelegramBotService],
  exports: [SmsService],
})
export class NotificationsModule {}

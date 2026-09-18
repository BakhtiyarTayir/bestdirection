import { Module } from "@nestjs/common";
import { HomeworkStatisticsService } from "./homework-statistics.service";
import { ProfileController } from "./profile.controller";
import { TelegramLinkService } from "./telegram-link.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController, ProfileController],
  providers: [UsersService, HomeworkStatisticsService, TelegramLinkService],
})
export class UsersModule {}

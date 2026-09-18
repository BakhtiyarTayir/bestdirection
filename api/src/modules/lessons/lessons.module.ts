import { Module } from "@nestjs/common";
import { LessonsController } from "./lessons.controller";
import { LessonsService } from "./lessons.service";
import { ProgressService } from "./progress.service";

@Module({
  controllers: [LessonsController],
  providers: [LessonsService, ProgressService],
})
export class LessonsModule {}

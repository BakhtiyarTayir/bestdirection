import { Module } from "@nestjs/common";
import { LessonsController } from "./lessons.controller";
import { LessonsService } from "./lessons.service";
import { ProgressService } from "./progress.service";
import { PublicContentController } from "./public.controller";
import { PublicContentService } from "./public.service";

@Module({
  controllers: [LessonsController, PublicContentController],
  providers: [LessonsService, ProgressService, PublicContentService],
})
export class LessonsModule {}

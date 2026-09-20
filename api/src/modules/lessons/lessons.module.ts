import { Module } from "@nestjs/common";
import { LessonsController } from "./lessons.controller";
import { LessonsService } from "./lessons.service";
import { PathsController } from "./paths.controller";
import { PathsService } from "./paths.service";
import { ProgressService } from "./progress.service";
import { PublicContentController } from "./public.controller";
import { PublicContentService } from "./public.service";

@Module({
  controllers: [LessonsController, PublicContentController, PathsController],
  providers: [LessonsService, ProgressService, PublicContentService, PathsService],
})
export class LessonsModule {}

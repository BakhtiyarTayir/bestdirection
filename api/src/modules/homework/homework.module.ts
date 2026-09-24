import { Module } from "@nestjs/common";
import { ParentNotificationsModule } from "../parent-notifications/parent-notifications.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { HomeworkController } from "./homework.controller";
import { HomeworkService } from "./homework.service";
import { HomeworkTransferController } from "./homework-transfer.controller";
import { HomeworkTransferService } from "./homework-transfer.service";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

// ParentNotificationsModule: проверка работы преподавателем шлёт родителям
// уведомление (план PLAN-PARENT-PROGRESS-2026-09-24, 2.2).
@Module({
  imports: [ParentNotificationsModule],
  controllers: [
    // Выгрузка и загрузка объявлены до общего контроллера заданий: у их путей
    // два сегмента, поэтому с :id они не спорят, но порядок нагляднее
    HomeworkTransferController,
    HomeworkController,
    SubmissionsController,
    FilesController,
    UploadsController,
  ],
  providers: [
    HomeworkService,
    SubmissionsService,
    FilesService,
    UploadsService,
    HomeworkTransferService,
  ],
  // SubmissionsService нужен боту: у него своей копии проверок нет
  exports: [SubmissionsService],
})
export class HomeworkModule {}

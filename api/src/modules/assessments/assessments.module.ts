import { Module } from "@nestjs/common";
import { AssessmentsController } from "./assessments.controller";
import { AssessmentsService } from "./assessments.service";
import { AssessmentExportService } from "./import/assessment-export.service";
import { AssessmentImportController } from "./import/import.controller";
import { AssessmentImportService } from "./import/import.service";

@Module({
  controllers: [AssessmentsController, AssessmentImportController],
  providers: [AssessmentsService, AssessmentImportService, AssessmentExportService],
})
export class AssessmentsModule {}

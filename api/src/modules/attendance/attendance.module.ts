import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { TeacherAttendanceService } from "./teacher-attendance.service";

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, TeacherAttendanceService],
})
export class AttendanceModule {}

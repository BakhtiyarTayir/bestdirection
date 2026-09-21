import { Module } from "@nestjs/common";
import { SalaryModule } from "../salary/salary.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { TeacherAttendanceService } from "./teacher-attendance.service";

// SalaryModule: с этапа 3 плана «Уроки и карточка группы» зарплата по
// занятиям опирается на журнал посещаемости — правка занятия (создание,
// удаление, смена ведущего, отметка) обязана сначала заморозить закрытые
// месяцы зарплаты, иначе поздняя правка задним числом переписала бы уже
// выплаченное (план, 4.8.1), тот же приём, что в GroupsModule.
@Module({
  imports: [SalaryModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, TeacherAttendanceService],
})
export class AttendanceModule {}

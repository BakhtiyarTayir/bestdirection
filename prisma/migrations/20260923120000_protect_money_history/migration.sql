-- Денежная история (Payment, TeacherSalaryAccrual, TeacherPayout) раньше
-- удалялась каскадом при окончательном удалении ученика/курса/преподавателя
-- (UsersService.purge, TrashService.hardDeleteCourseRecord). Меняем ON DELETE
-- на RESTRICT: приложение теперь проверяет наличие денежных записей заранее
-- и отвечает понятной ошибкой вместо того, чтобы стирать кассу и зарплату.
-- Данные не трогаем — только правила внешних ключей.

-- AlterTable
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_studentId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_courseId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TeacherSalaryAccrual" DROP CONSTRAINT "TeacherSalaryAccrual_teacherId_fkey";
ALTER TABLE "TeacherSalaryAccrual" ADD CONSTRAINT "TeacherSalaryAccrual_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TeacherSalaryAccrual" DROP CONSTRAINT "TeacherSalaryAccrual_courseId_fkey";
ALTER TABLE "TeacherSalaryAccrual" ADD CONSTRAINT "TeacherSalaryAccrual_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TeacherPayout" DROP CONSTRAINT "TeacherPayout_teacherId_fkey";
ALTER TABLE "TeacherPayout" ADD CONSTRAINT "TeacherPayout_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

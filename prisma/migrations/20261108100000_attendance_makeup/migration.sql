-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN "isMakeup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TeacherSalaryAccrual" ADD COLUMN "lessonsMakeup" INTEGER;

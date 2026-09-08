-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "teacherId" TEXT,
ADD COLUMN     "teacherNote" TEXT,
ADD COLUMN     "teacherStatus" "AttendanceStatus";

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "teacherId" TEXT;

-- CreateIndex
CREATE INDEX "AttendanceSession_teacherId_idx" ON "AttendanceSession"("teacherId");

-- CreateIndex
CREATE INDEX "AttendanceSession_date_idx" ON "AttendanceSession"("date");

-- CreateIndex
CREATE INDEX "Group_teacherId_idx" ON "Group"("teacherId");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Перенос данных: у существующих групп преподаватель берётся из курса.
-- Другого источника нет — до этой миграции педагог хранился только там.
UPDATE "Group" g
SET "teacherId" = c."teacherId"
FROM "Course" c
WHERE g."courseId" = c."id" AND g."teacherId" IS NULL;

-- Прошедшие занятия намеренно остаются без преподавателя: кто их вёл на
-- самом деле, в базе не записано, а подставлять педагога курса значило бы
-- выдумать данные. Отчёты по таким занятиям опираются на группу.

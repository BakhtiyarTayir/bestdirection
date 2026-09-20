-- Зарплата преподавателей (план зарплат, раздел 5). Новых данных в базе ещё
-- нет — таблицы пустые, поэтому миграция ничего не переносит, в отличие от
-- 20260916090000_attendance_no_group_unique.

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "salaryPercentBp" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "salaryPercentBp" INTEGER;

-- CreateTable
CREATE TABLE "TeacherSalaryAccrual" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "groupId" TEXT,
    "branchId" TEXT,
    "month" TEXT NOT NULL,
    "base" INTEGER NOT NULL,
    "percentUsed" INTEGER,
    "amount" INTEGER NOT NULL,
    "studentsCount" INTEGER NOT NULL,
    "manualAmount" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherSalaryAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherPayout" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "forMonth" TEXT,
    "comment" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "TeacherPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherSalaryAccrual_month_idx" ON "TeacherSalaryAccrual"("month");

-- CreateIndex
CREATE INDEX "TeacherSalaryAccrual_teacherId_idx" ON "TeacherSalaryAccrual"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherSalaryAccrual_branchId_idx" ON "TeacherSalaryAccrual"("branchId");

-- CreateIndex
CREATE INDEX "TeacherSalaryAccrual_lockedAt_idx" ON "TeacherSalaryAccrual"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSalaryAccrual_teacherId_courseId_groupId_month_key" ON "TeacherSalaryAccrual"("teacherId", "courseId", "groupId", "month");

-- CreateIndex
CREATE INDEX "TeacherPayout_teacherId_idx" ON "TeacherPayout"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherPayout_paidAt_idx" ON "TeacherPayout"("paidAt");

-- CreateIndex
CREATE INDEX "TeacherPayout_forMonth_idx" ON "TeacherPayout"("forMonth");

-- CreateIndex
CREATE INDEX "TeacherPayout_deletedAt_idx" ON "TeacherPayout"("deletedAt");

-- AddForeignKey
ALTER TABLE "TeacherSalaryAccrual" ADD CONSTRAINT "TeacherSalaryAccrual_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSalaryAccrual" ADD CONSTRAINT "TeacherSalaryAccrual_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSalaryAccrual" ADD CONSTRAINT "TeacherSalaryAccrual_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSalaryAccrual" ADD CONSTRAINT "TeacherSalaryAccrual_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPayout" ADD CONSTRAINT "TeacherPayout_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPayout" ADD CONSTRAINT "TeacherPayout_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPayout" ADD CONSTRAINT "TeacherPayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ловушка NULL в составном уникальном ключе: обычный @@unique выше
-- (teacherId, courseId, groupId, month) НЕ защищает начисления без группы —
-- в Postgres NULL не равен NULL, и два начисления одному педагогу по одному
-- курсу за один месяц без группы прошли бы оба. Prisma не умеет описывать
-- частичные уникальные индексы в схеме, поэтому он живёт только здесь; в
-- schema.prisma рядом с @@unique стоит об этом напоминание. Тот же приём —
-- в миграции 20260916090000_attendance_no_group_unique. Переносить дубли
-- незачем: таблица только что создана и пуста.
CREATE UNIQUE INDEX "TeacherSalaryAccrual_no_group_unique"
  ON "TeacherSalaryAccrual" ("teacherId", "courseId", "month")
  WHERE "groupId" IS NULL;

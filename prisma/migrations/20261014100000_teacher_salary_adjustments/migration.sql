-- CreateEnum
CREATE TYPE "SalaryAdjustmentKind" AS ENUM ('BONUS', 'PENALTY');

-- CreateTable
CREATE TABLE "TeacherSalaryAdjustment" (
    "id" TEXT NOT NULL,
    "kind" "SalaryAdjustmentKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teacherId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "TeacherSalaryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherSalaryAdjustment_teacherId_month_idx" ON "TeacherSalaryAdjustment"("teacherId", "month");

-- CreateIndex
CREATE INDEX "TeacherSalaryAdjustment_deletedAt_idx" ON "TeacherSalaryAdjustment"("deletedAt");

-- AddForeignKey
ALTER TABLE "TeacherSalaryAdjustment" ADD CONSTRAINT "TeacherSalaryAdjustment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSalaryAdjustment" ADD CONSTRAINT "TeacherSalaryAdjustment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSalaryAdjustment" ADD CONSTRAINT "TeacherSalaryAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

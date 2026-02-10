-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "copiedAt" TIMESTAMP(3),
ADD COLUMN     "copiedFromId" TEXT,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Course_isTemplate_idx" ON "Course"("isTemplate");

-- CreateIndex
CREATE INDEX "Course_copiedFromId_idx" ON "Course"("copiedFromId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

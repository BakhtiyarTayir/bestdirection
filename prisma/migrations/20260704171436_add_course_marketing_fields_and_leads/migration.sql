-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "intakeNoteRu" TEXT,
ADD COLUMN     "intakeNoteUz" TEXT,
ADD COLUMN     "intakeSeats" INTEGER,
ADD COLUMN     "intakeStartDate" TIMESTAMP(3),
ADD COLUMN     "isPublicListed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price" INTEGER,
ADD COLUMN     "publicSummaryRu" TEXT,
ADD COLUMN     "publicSummaryUz" TEXT;

-- CreateTable
CREATE TABLE "CourseLead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "CourseLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseLead_courseId_idx" ON "CourseLead"("courseId");

-- CreateIndex
CREATE INDEX "CourseLead_contacted_idx" ON "CourseLead"("contacted");

-- CreateIndex
CREATE INDEX "Course_isPublicListed_idx" ON "Course"("isPublicListed");

-- AddForeignKey
ALTER TABLE "CourseLead" ADD CONSTRAINT "CourseLead_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

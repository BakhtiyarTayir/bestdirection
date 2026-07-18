-- CreateEnum
CREATE TYPE "CourseAccessType" AS ENUM ('CLOSED', 'FREE', 'PAID');

-- CreateEnum
CREATE TYPE "EnrollmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "accessType" "CourseAccessType" NOT NULL DEFAULT 'CLOSED';

-- CreateTable
CREATE TABLE "EnrollmentRequest" (
    "id" TEXT NOT NULL,
    "status" "EnrollmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "EnrollmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrollmentRequest_status_idx" ON "EnrollmentRequest"("status");

-- CreateIndex
CREATE INDEX "EnrollmentRequest_studentId_idx" ON "EnrollmentRequest"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentRequest_courseId_studentId_key" ON "EnrollmentRequest"("courseId", "studentId");

-- CreateIndex
CREATE INDEX "Course_accessType_idx" ON "Course"("accessType");

-- AddForeignKey
ALTER TABLE "EnrollmentRequest" ADD CONSTRAINT "EnrollmentRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentRequest" ADD CONSTRAINT "EnrollmentRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentRequest" ADD CONSTRAINT "EnrollmentRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

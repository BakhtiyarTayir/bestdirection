-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schedule" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "settings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Group_courseId_idx" ON "Group"("courseId");
CREATE INDEX "Group_isActive_idx" ON "Group"("isActive");
CREATE UNIQUE INDEX "Group_courseId_name_key" ON "Group"("courseId", "name");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Enrollment: add id, groupId, updatedAt
-- Step 1: Add columns as nullable first
ALTER TABLE "Enrollment" ADD COLUMN "id" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Step 2: Populate existing rows
UPDATE "Enrollment" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
UPDATE "Enrollment" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- Step 3: Make columns required
ALTER TABLE "Enrollment" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Enrollment" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Step 4: Drop old composite PK and add new PK
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_pkey";
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id");

-- Step 5: Add unique constraint (replaces old PK)
CREATE UNIQUE INDEX "Enrollment_studentId_courseId_key" ON "Enrollment"("studentId", "courseId");

-- Step 6: Add index and FK for groupId
CREATE INDEX "Enrollment_groupId_idx" ON "Enrollment"("groupId");
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable AttendanceSession: add groupId
ALTER TABLE "AttendanceSession" ADD COLUMN "groupId" TEXT;

-- Drop old unique index and add new one
DROP INDEX "AttendanceSession_courseId_date_key";
CREATE UNIQUE INDEX "AttendanceSession_courseId_date_groupId_key" ON "AttendanceSession"("courseId", "date", "groupId");

-- Add index and FK for groupId
CREATE INDEX "AttendanceSession_groupId_idx" ON "AttendanceSession"("groupId");
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

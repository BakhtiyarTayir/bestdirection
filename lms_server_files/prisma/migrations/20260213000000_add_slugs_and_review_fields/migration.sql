-- CreateEnum
CREATE TYPE "ManualReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION');

-- AlterTable: Course - add slug
ALTER TABLE "Course" ADD COLUMN "slug" TEXT;

-- Populate slugs for existing courses
UPDATE "Course" SET "slug" = LOWER(REPLACE(REPLACE(REPLACE("title", ' ', '-'), '''', ''), '"', '')) WHERE "slug" IS NULL;
-- Ensure uniqueness by appending id suffix for duplicates
UPDATE "Course" SET "slug" = "slug" || '-' || LEFT("id", 6) WHERE "slug" IN (SELECT "slug" FROM "Course" GROUP BY "slug" HAVING COUNT(*) > 1);

ALTER TABLE "Course" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- AlterTable: Lesson - add slug
ALTER TABLE "Lesson" ADD COLUMN "slug" TEXT;

-- Populate slugs for existing lessons
UPDATE "Lesson" SET "slug" = LOWER(REPLACE(REPLACE(REPLACE("title", ' ', '-'), '''', ''), '"', '')) WHERE "slug" IS NULL;
-- Ensure uniqueness within course by appending sortOrder
UPDATE "Lesson" l1 SET "slug" = l1."slug" || '-' || l1."sortOrder"
WHERE EXISTS (
  SELECT 1 FROM "Lesson" l2
  WHERE l2."courseId" = l1."courseId" AND l2."slug" = l1."slug" AND l2."id" != l1."id"
);

ALTER TABLE "Lesson" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Lesson_courseId_slug_key" ON "Lesson"("courseId", "slug");

-- AlterTable: Homework - add slug and review fields
ALTER TABLE "Homework" ADD COLUMN "slug" TEXT;
ALTER TABLE "Homework" ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Homework" ADD COLUMN "reviewInstructions" TEXT;

-- Populate slugs for existing homeworks
UPDATE "Homework" SET "slug" = LOWER(REPLACE(REPLACE(REPLACE("title", ' ', '-'), '''', ''), '"', '')) WHERE "slug" IS NULL;
UPDATE "Homework" h1 SET "slug" = h1."slug" || '-' || h1."sortOrder"
WHERE EXISTS (
  SELECT 1 FROM "Homework" h2
  WHERE h2."lessonId" = h1."lessonId" AND h2."slug" = h1."slug" AND h2."id" != h1."id"
);

ALTER TABLE "Homework" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Homework_lessonId_slug_key" ON "Homework"("lessonId", "slug");

-- AlterTable: Submission - add review fields
ALTER TABLE "Submission" ADD COLUMN "manualStatus" "ManualReviewStatus";
ALTER TABLE "Submission" ADD COLUMN "teacherComment" TEXT;
ALTER TABLE "Submission" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Submission" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Submission" ADD COLUMN "manualScore" INTEGER;

CREATE INDEX "Submission_manualStatus_idx" ON "Submission"("manualStatus");
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: User - add telegram fields
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramUsername" TEXT;
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateTable: SubmissionFile
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionFile_submissionId_idx" ON "SubmissionFile"("submissionId");
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

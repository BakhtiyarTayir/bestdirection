-- Развязка заявок лендинга от курсов платформы: CourseLead.courseId (FK) →
-- CourseLead.courseName (строка). Существующие заявки сохраняют название курса.

-- DropForeignKey
ALTER TABLE "CourseLead" DROP CONSTRAINT "CourseLead_courseId_fkey";

-- DropIndex
DROP INDEX "CourseLead_courseId_idx";

-- Add column nullable, backfill from the referenced course, then enforce NOT NULL
ALTER TABLE "CourseLead" ADD COLUMN "courseName" TEXT;

UPDATE "CourseLead"
SET "courseName" = c.title
FROM "Course" c
WHERE c.id = "CourseLead"."courseId";

UPDATE "CourseLead" SET "courseName" = '—' WHERE "courseName" IS NULL;

ALTER TABLE "CourseLead" ALTER COLUMN "courseName" SET NOT NULL;

ALTER TABLE "CourseLead" DROP COLUMN "courseId";

-- Backfill NULL content before adding NOT NULL constraint
UPDATE "Lesson" SET "content" = '' WHERE "content" IS NULL;

-- Make content required with default
ALTER TABLE "Lesson" ALTER COLUMN "content" SET NOT NULL;
ALTER TABLE "Lesson" ALTER COLUMN "content" SET DEFAULT '';

-- Remove type column and enum
ALTER TABLE "Lesson" DROP COLUMN "type";
DROP TYPE "LessonType";

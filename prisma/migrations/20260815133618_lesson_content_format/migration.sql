-- CreateEnum
CREATE TYPE "LessonContentFormat" AS ENUM ('MARKDOWN', 'HTML');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "contentFormat" "LessonContentFormat" NOT NULL DEFAULT 'MARKDOWN';

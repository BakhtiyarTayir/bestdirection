-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1;

-- Нумеруем уже существующие попытки: без этого уникальный индекс не создастся
-- там, где у ученика их больше одной.
UPDATE "AssessmentAttempt" a
SET "attemptNumber" = s.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY "assessmentId", "studentId" ORDER BY "startedAt") AS rn
  FROM "AssessmentAttempt"
) s
WHERE a.id = s.id;

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assessmentId_studentId_attemptNumber_key" ON "AssessmentAttempt"("assessmentId", "studentId", "attemptNumber");

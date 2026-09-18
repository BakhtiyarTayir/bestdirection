-- Уникальный номер попытки у работ: защита от гонки при сдаче (аудит 3.4).
-- Сначала выравниваем номера у уже существующих работ: подсчёт в транзакции
-- от гонки не спасал, поэтому дубли теоретически возможны.
WITH numbered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "homeworkId", "studentId"
           ORDER BY "createdAt", id
         ) AS position
  FROM "Submission"
)
UPDATE "Submission" s
SET "attemptNumber" = numbered.position
FROM numbered
WHERE s.id = numbered.id
  AND s."attemptNumber" <> numbered.position;

CREATE UNIQUE INDEX "Submission_homeworkId_studentId_attemptNumber_key"
  ON "Submission"("homeworkId", "studentId", "attemptNumber");

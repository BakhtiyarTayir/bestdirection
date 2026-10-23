-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "unenrolledFromGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Enrollment_unenrolledFromGroupId_idx" ON "Enrollment"("unenrolledFromGroupId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_unenrolledFromGroupId_fkey" FOREIGN KEY ("unenrolledFromGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill для уже отчисленных: группа берётся из последней записи аудита
-- removeStudent (entityType 'Enrollment', action 'UPDATE', entityId
-- 'studentId:courseId', metadata {"groupId": ..., "alsoUnenroll": true}).
-- Только если такая группа ещё существует.
UPDATE "Enrollment" e
SET "unenrolledFromGroupId" = g."id"
FROM (
    SELECT DISTINCT ON ("entityId") "entityId", "metadata"->>'groupId' AS "groupId"
    FROM "AuditLog"
    WHERE "entityType" = 'Enrollment'
      AND "action" = 'UPDATE'
      AND "metadata"->>'alsoUnenroll' = 'true'
    ORDER BY "entityId", "createdAt" DESC
) a
JOIN "Group" g ON g."id" = a."groupId"
WHERE e."unenrolledAt" IS NOT NULL
  AND e."groupId" IS NULL
  AND e."unenrolledFromGroupId" IS NULL
  AND a."entityId" = e."studentId" || ':' || e."courseId";

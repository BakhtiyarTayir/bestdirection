-- Уникальность (courseId, date, groupId) не защищает занятия без группы:
-- в Postgres NULL не равен NULL, поэтому два занятия одного курса на одну дату
-- без группы создавались молча. В сетке курса появлялись две колонки с одной
-- датой, а отчёт засчитывал преподавателю урок дважды — один отмеченным,
-- второй неотмеченным.
--
-- Prisma не умеет описывать частичные уникальные индексы в схеме, поэтому
-- индекс живёт только здесь; в schema.prisma рядом с @@unique стоит об этом
-- напоминание.
--
-- Уже существующие дубли СЛИВАЮТСЯ, а не удаляются: отметки переносятся в самое
-- раннее занятие пары. Просто удалять нельзя — потеряются отметки; просто
-- оставить тоже нельзя — индекс не создастся, а миграции накатываются при
-- старте контейнера, и приложение не поднимется.

CREATE TEMP TABLE attendance_nogroup_dupes AS
SELECT s.id AS dup_id, k.keep_id
FROM "AttendanceSession" s
JOIN (
  SELECT "courseId", date, min(id) AS keep_id
  FROM "AttendanceSession"
  WHERE "groupId" IS NULL
  GROUP BY "courseId", date
  HAVING count(*) > 1
) k ON k."courseId" = s."courseId" AND k.date = s.date
WHERE s."groupId" IS NULL AND s.id <> k.keep_id;

-- 1. Если ученик уже отмечен в сохраняемом занятии, его отметку из дубля
--    отбрасываем: (sessionId, studentId) уникальна, перенести обе нельзя.
DELETE FROM "AttendanceRecord" r
USING attendance_nogroup_dupes d
WHERE r."sessionId" = d.dup_id
  AND EXISTS (
    SELECT 1 FROM "AttendanceRecord" keep
    WHERE keep."sessionId" = d.keep_id AND keep."studentId" = r."studentId"
  );

-- 2. Остальные отметки переносим в сохраняемое занятие
UPDATE "AttendanceRecord" r
SET "sessionId" = d.keep_id
FROM attendance_nogroup_dupes d
WHERE r."sessionId" = d.dup_id;

-- 3. Опустевшие дубли удаляем. Заметка и отметка преподавателя из дубля
--    теряются — сохраняем данные самого раннего занятия.
DELETE FROM "AttendanceSession" s
USING attendance_nogroup_dupes d
WHERE s.id = d.dup_id;

DROP TABLE attendance_nogroup_dupes;

CREATE UNIQUE INDEX "AttendanceSession_courseId_date_nogroup_key"
  ON "AttendanceSession" ("courseId", date)
  WHERE "groupId" IS NULL;

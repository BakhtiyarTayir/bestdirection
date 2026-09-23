-- Снимок группы в строке начисления: база зарплаты за закрытый месяц
-- берётся по группе, где ученик учился тогда, а не где он сейчас.
ALTER TABLE "MonthlyCharge" ADD COLUMN "groupId" TEXT;

-- Уже замороженные строки: другого источника нет, берём текущую группу
-- записи. Для учеников, которых переводили после заморозки, это неточно,
-- но на момент миграции реестр почти пуст (первые месяцы с начислениями
-- закрываются 1 октября 2026).
UPDATE "MonthlyCharge" mc
SET "groupId" = e."groupId"
FROM "Enrollment" e
WHERE e.id = mc."enrollmentId";

CREATE INDEX "MonthlyCharge_groupId_month_idx" ON "MonthlyCharge"("groupId", "month");

-- Пометка строки ведущего группы в закрытом месяце. Для уже замороженных
-- строк другого источника нет: ведущим считается нынешний педагог группы
-- (или курса, если группы нет).
ALTER TABLE "TeacherSalaryAccrual" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TeacherSalaryAccrual" a
SET "isOwner" = true
WHERE a."teacherId" = (
  SELECT COALESCE(g."teacherId", c."teacherId")
  FROM "Course" c
  LEFT JOIN "Group" g ON g.id = a."groupId"
  WHERE c.id = a."courseId"
);

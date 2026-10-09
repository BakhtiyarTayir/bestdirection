-- Пароль ученика в обратимо зашифрованном виде (виден только администратору)
-- и время последнего входа. Колонки только добавляются, ничего не удаляется.
ALTER TABLE "User" ADD COLUMN "passwordEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Заполнение из сессий: самая ранняя createdAt по пользователю. Неполное
-- (выход из системы удаляет сессию), поэтому «ни разу не входил» проверяется
-- ещё и по наличию сессий.
UPDATE "User" u
SET "lastLoginAt" = s."firstSeen"
FROM (
  SELECT "userId", MIN("createdAt") AS "firstSeen" FROM "Session" GROUP BY "userId"
) s
WHERE s."userId" = u."id";

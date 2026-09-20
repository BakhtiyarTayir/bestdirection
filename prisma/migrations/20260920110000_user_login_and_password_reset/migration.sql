-- Шаг 1 отказа от почты (PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, раздел 4.1):
-- логин добавляется НЕОБЯЗАТЕЛЬНОЙ колонкой. Почта и вход по ней продолжают
-- работать — обязательным (NOT NULL) логин станет отдельной миграцией, когда
-- все убедятся, что могут войти по новому логину.
--
-- Заполнение существующих строк логином здесь НЕ делается: транслитерация
-- кириллицы («Иван Иванов» → ivan.ivanov) и безопасная разводка коллизий
-- недоступны в чистом SQL без функций уровня приложения. Этим занимается
-- UserLoginBackfillService (api/src/modules/users/user-login-backfill.service.ts),
-- который выполняется при старте api ДО начала обслуживания запросов, теми же
-- slugify/generateUniqueSlug, что уже применяются к слагам курсов. Он
-- идемпотентен (трогает только строки с login IS NULL) и покрыт тестом
-- auth.e2e-spec.ts, поэтому логика находится там, а не в SQL-миграции.
ALTER TABLE "User" ADD COLUMN "login" TEXT;
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- Код сброса пароля через Telegram — второй, независимый от почты путь
-- восстановления доступа. В базе лежит только хэш кода.
CREATE TABLE "PasswordResetRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetRequest_userId_key" ON "PasswordResetRequest"("userId");

ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

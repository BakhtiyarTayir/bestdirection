-- Уведомления родителям об успеваемости ребёнка (пропуск, проверенное
-- задание, еженедельная сводка). Только добавление — таблица и колонка,
-- обратной несовместимости нет.

-- Включено по умолчанию для всех: раньше уведомлений не было вовсе, поэтому
-- "включить всем" ничего не ломает и не рассылает задним числом.
ALTER TABLE "User" ADD COLUMN "parentProgressNotifications" BOOLEAN NOT NULL DEFAULT true;

-- Защита от повторной отправки еженедельной сводки при перезапуске
-- контейнера в понедельник утром: уникальность weekKey ловит гонку на
-- уровне БД, а не проверкой «уже отправляли» перед стартом рассылки.
CREATE TABLE "WeeklyDigestRun" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyDigestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyDigestRun_weekKey_key" ON "WeeklyDigestRun"("weekKey");

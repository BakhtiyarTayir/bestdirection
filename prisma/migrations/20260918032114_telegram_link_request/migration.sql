-- CreateTable
CREATE TABLE "TelegramLinkRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkRequest_code_key" ON "TelegramLinkRequest"("code");

-- CreateIndex
CREATE INDEX "TelegramLinkRequest_userId_idx" ON "TelegramLinkRequest"("userId");

-- CreateIndex
CREATE INDEX "TelegramLinkRequest_expiresAt_idx" ON "TelegramLinkRequest"("expiresAt");

-- AddForeignKey
ALTER TABLE "TelegramLinkRequest" ADD CONSTRAINT "TelegramLinkRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Коды привязки раньше клали в User.telegramChatId как "pending:<код>": вторая
-- попытка привязки затирала настоящий chat id и ломала вход через Telegram
-- (аудит 2.8). Это не данные, а мусор — освобождаем поле.
UPDATE "User" SET "telegramChatId" = NULL WHERE "telegramChatId" LIKE 'pending:%';

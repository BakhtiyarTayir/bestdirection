-- Филиалы (этап 1 плана 2026-09-20): справочник + branchId у Group (обязателен),
-- User и Payment (снимок, необязателен).
--
-- Порядок внутри файла важен и НЕ должен меняться: сначала таблица и
-- единственный на сегодня филиал «Главный», потом колонки (ещё NULL),
-- потом заполнение существующих строк, и только в САМОМ КОНЦЕ — NOT NULL
-- и смена уникального индекса у Group. Если поставить SET NOT NULL раньше
-- UPDATE, миграция упадёт на живой базе с данными, а `prisma migrate` не
-- откатывается — контейнер api просто не поднимется.

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

-- Единственный сегодняшний филиал. Название администратор переименует в
-- интерфейсе; данных мало (прод: база 11 МБ), UPDATE без WHERE ниже безопасен.
INSERT INTO "Branch" ("id", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES ('branch_main', 'Главный', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: колонки добавляются ещё нетребовательными — заполним следующим шагом
ALTER TABLE "Group" ADD COLUMN "branchId" TEXT;
ALTER TABLE "User" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "branchId" TEXT;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Переносим все существующие строки в единственный филиал
UPDATE "Group" SET "branchId" = 'branch_main';
UPDATE "User" SET "branchId" = 'branch_main';
UPDATE "Payment" SET "branchId" = 'branch_main';

-- Только теперь, когда пустых значений не осталось
ALTER TABLE "Group" ALTER COLUMN "branchId" SET NOT NULL;

-- Имя группы уникально внутри филиала, а не на весь центр
DROP INDEX "Group_courseId_name_key";
CREATE UNIQUE INDEX "Group_courseId_branchId_name_key" ON "Group"("courseId", "branchId", "name");

-- CreateIndex
CREATE INDEX "Group_branchId_idx" ON "Group"("branchId");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");

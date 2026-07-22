-- AlterTable
ALTER TABLE "User" ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_number_key" ON "User"("number");


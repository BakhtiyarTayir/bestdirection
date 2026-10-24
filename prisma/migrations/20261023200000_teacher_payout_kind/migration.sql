-- CreateEnum
CREATE TYPE "PayoutKind" AS ENUM ('SALARY', 'ADVANCE');

-- AlterTable: прежние выплаты считаются зарплатой (авансов среди них нет)
ALTER TABLE "TeacherPayout" ADD COLUMN "kind" "PayoutKind" NOT NULL DEFAULT 'SALARY';

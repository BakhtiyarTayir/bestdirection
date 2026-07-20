-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "billingEndsAt" TIMESTAMP(3),
ADD COLUMN     "firstMonthCharge" INTEGER,
ADD COLUMN     "priceOverride" INTEGER,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "scheduleDays" INTEGER[];

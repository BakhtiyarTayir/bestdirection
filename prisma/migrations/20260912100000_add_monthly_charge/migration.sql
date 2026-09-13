-- CreateTable
CREATE TABLE "MonthlyCharge" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "basis" TEXT NOT NULL,
    "unitsTotal" INTEGER NOT NULL,
    "unitsBilled" INTEGER NOT NULL,
    "priceUsed" INTEGER NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyCharge_month_idx" ON "MonthlyCharge"("month");

-- CreateIndex
CREATE INDEX "MonthlyCharge_lockedAt_idx" ON "MonthlyCharge"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyCharge_enrollmentId_month_key" ON "MonthlyCharge"("enrollmentId", "month");

-- AddForeignKey
ALTER TABLE "MonthlyCharge" ADD CONSTRAINT "MonthlyCharge_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

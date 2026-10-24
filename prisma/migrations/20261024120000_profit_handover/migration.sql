-- CreateTable
CREATE TABLE "ProfitHandover" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "handedAt" TIMESTAMP(3) NOT NULL,
    "forMonth" TEXT NOT NULL,
    "receivedBy" TEXT,
    "comment" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ProfitHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfitHandover_branchId_forMonth_idx" ON "ProfitHandover"("branchId", "forMonth");

-- AddForeignKey
ALTER TABLE "ProfitHandover" ADD CONSTRAINT "ProfitHandover_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitHandover" ADD CONSTRAINT "ProfitHandover_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

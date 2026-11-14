CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "refundedAt" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "groupId" TEXT,
    "branchId" TEXT,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0)
);
CREATE INDEX "Refund_studentId_idx" ON "Refund"("studentId");
CREATE INDEX "Refund_courseId_idx" ON "Refund"("courseId");
CREATE INDEX "Refund_groupId_idx" ON "Refund"("groupId");
CREATE INDEX "Refund_branchId_idx" ON "Refund"("branchId");
CREATE INDEX "Refund_refundedAt_idx" ON "Refund"("refundedAt");
CREATE INDEX "Refund_deletedAt_idx" ON "Refund"("deletedAt");
CREATE INDEX "Refund_createdById_idx" ON "Refund"("createdById");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

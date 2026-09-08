-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "SmsTemplateStatus" AS ENUM ('DRAFT', 'MODERATION', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "IntegrationToken" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL,
    "eskizId" INTEGER,
    "title" TEXT NOT NULL,
    "textRu" TEXT NOT NULL,
    "textUz" TEXT NOT NULL,
    "status" "SmsTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsBroadcast" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "templateId" TEXT,
    "groupId" TEXT,
    "createdById" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "userSmsId" TEXT,
    "price" INTEGER,
    "parts" INTEGER,
    "error" TEXT,
    "userId" TEXT,
    "broadcastId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationToken_provider_key" ON "IntegrationToken"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "SmsTemplate_eskizId_key" ON "SmsTemplate"("eskizId");

-- CreateIndex
CREATE INDEX "SmsTemplate_status_idx" ON "SmsTemplate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SmsBroadcast_dispatchId_key" ON "SmsBroadcast"("dispatchId");

-- CreateIndex
CREATE INDEX "SmsBroadcast_groupId_idx" ON "SmsBroadcast"("groupId");

-- CreateIndex
CREATE INDEX "SmsBroadcast_createdAt_idx" ON "SmsBroadcast"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsLog_userSmsId_key" ON "SmsLog"("userSmsId");

-- CreateIndex
CREATE INDEX "SmsLog_phone_idx" ON "SmsLog"("phone");

-- CreateIndex
CREATE INDEX "SmsLog_status_idx" ON "SmsLog"("status");

-- CreateIndex
CREATE INDEX "SmsLog_broadcastId_idx" ON "SmsLog"("broadcastId");

-- CreateIndex
CREATE INDEX "SmsLog_createdAt_idx" ON "SmsLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SmsBroadcast" ADD CONSTRAINT "SmsBroadcast_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SmsTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsBroadcast" ADD CONSTRAINT "SmsBroadcast_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsBroadcast" ADD CONSTRAINT "SmsBroadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "SmsBroadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

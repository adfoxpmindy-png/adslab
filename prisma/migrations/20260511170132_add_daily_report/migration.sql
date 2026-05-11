-- CreateEnum
CREATE TYPE "DailyReportStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "status" "DailyReportStatus" NOT NULL DEFAULT 'GENERATING',
    "contentMd" TEXT,
    "payloadSnapshot" JSONB,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "deliveryError" TEXT,
    "generationError" TEXT,
    "generatedBy" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReport_tenantId_generatedAt_idx" ON "DailyReport"("tenantId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_tenantId_reportDate_key" ON "DailyReport"("tenantId", "reportDate");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

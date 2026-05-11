-- CreateTable
CREATE TABLE "MetaInsightCache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaInsightCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaInsightCache_tenantId_idx" ON "MetaInsightCache"("tenantId");

-- CreateIndex
CREATE INDEX "MetaInsightCache_expiresAt_idx" ON "MetaInsightCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInsightCache_tenantId_scope_rangeKey_key" ON "MetaInsightCache"("tenantId", "scope", "rangeKey");

-- AddForeignKey
ALTER TABLE "MetaInsightCache" ADD CONSTRAINT "MetaInsightCache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

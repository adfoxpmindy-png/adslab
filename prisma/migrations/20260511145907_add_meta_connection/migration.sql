-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "metaUserId" TEXT NOT NULL,
    "metaUserName" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "metaAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezoneName" TEXT NOT NULL,
    "accountStatus" INTEGER NOT NULL,
    "businessId" TEXT,
    "businessName" TEXT,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_tenantId_key" ON "MetaConnection"("tenantId");

-- CreateIndex
CREATE INDEX "MetaConnection_metaUserId_idx" ON "MetaConnection"("metaUserId");

-- CreateIndex
CREATE INDEX "MetaConnection_status_idx" ON "MetaConnection"("status");

-- CreateIndex
CREATE INDEX "MetaAdAccount_metaConnectionId_idx" ON "MetaAdAccount"("metaConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_metaConnectionId_metaAccountId_key" ON "MetaAdAccount"("metaConnectionId", "metaAccountId");

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_metaConnectionId_fkey" FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

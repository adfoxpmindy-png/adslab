-- CreateTable
CREATE TABLE "ViewerLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "dateRange" TEXT NOT NULL DEFAULT '7d',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),

    CONSTRAINT "ViewerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdCreativePreview" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT,
    "videoThumbUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdCreativePreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ViewerLink_token_key" ON "ViewerLink"("token");

-- CreateIndex
CREATE INDEX "ViewerLink_tenantId_createdAt_idx" ON "ViewerLink"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ViewerLink_token_idx" ON "ViewerLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdCreativePreview_creativeId_key" ON "MetaAdCreativePreview"("creativeId");

-- CreateIndex
CREATE INDEX "MetaAdCreativePreview_expiresAt_idx" ON "MetaAdCreativePreview"("expiresAt");

-- AddForeignKey
ALTER TABLE "ViewerLink" ADD CONSTRAINT "ViewerLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewerLink" ADD CONSTRAINT "ViewerLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

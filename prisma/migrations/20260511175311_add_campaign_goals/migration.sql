-- CreateEnum
CREATE TYPE "GoalObjective" AS ENUM ('AWARENESS', 'ENGAGEMENT', 'TRAFFIC', 'LEADS', 'SALES', 'APP_PROMOTION', 'STORE_VISITS');

-- CreateEnum
CREATE TYPE "GoalKpi" AS ENUM ('ROAS', 'CPM', 'CTR', 'CPC', 'CPL', 'CPA', 'REACH', 'FREQUENCY', 'CONVERSIONS', 'ENGAGEMENT_RATE');

-- CreateEnum
CREATE TYPE "GoalSource" AS ENUM ('AUTO_META', 'AUTO_NAME', 'USER_MANUAL', 'TENANT_DEFAULT');

-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "metaCampaignId" TEXT NOT NULL,
    "metaAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metaObjective" TEXT,
    "effectiveStatus" TEXT NOT NULL,
    "configuredStatus" TEXT,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignGoal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "objective" "GoalObjective" NOT NULL,
    "primaryKpi" "GoalKpi",
    "primaryTarget" DOUBLE PRECISION,
    "secondaryKpis" JSONB,
    "source" "GoalSource" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NamingConvention" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT false,
    "objective" "GoalObjective" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NamingConvention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaCampaign_metaConnectionId_idx" ON "MetaCampaign"("metaConnectionId");

-- CreateIndex
CREATE INDEX "MetaCampaign_metaAccountId_idx" ON "MetaCampaign"("metaAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaign_metaConnectionId_metaCampaignId_key" ON "MetaCampaign"("metaConnectionId", "metaCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignGoal_campaignId_key" ON "CampaignGoal"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignGoal_tenantId_idx" ON "CampaignGoal"("tenantId");

-- CreateIndex
CREATE INDEX "CampaignGoal_source_idx" ON "CampaignGoal"("source");

-- CreateIndex
CREATE INDEX "NamingConvention_tenantId_priority_idx" ON "NamingConvention"("tenantId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "NamingConvention_tenantId_pattern_key" ON "NamingConvention"("tenantId", "pattern");

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_metaConnectionId_fkey" FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NamingConvention" ADD CONSTRAINT "NamingConvention_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

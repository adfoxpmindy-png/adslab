-- Hook Lab v2 — four new tables:
--   HookConcept   generated / iterated / analyzed / manual concepts
--   HookAnalysis  score-a-hook submissions
--   HookProfile   per-tenant product/audience/desire prefill
--   HookWinner    Meta-detected top winner cache
--
-- All tables cascade-delete from Tenant. HookConcept has a self-FK on
-- parentConceptId (SetNull) so deleting a parent winner preserves its
-- iteration history but disconnects the link.

-- CreateTable
CREATE TABLE "HookConcept" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "parentConceptId" TEXT,
    "textHookTh" TEXT,
    "textHookEn" TEXT,
    "bodyOutline" TEXT,
    "visualDirections" JSONB,
    "leverChanged" TEXT,
    "hypothesis" TEXT,
    "angleChange" JSONB,
    "awarenessStage" TEXT,
    "sophisticationStage" INTEGER,
    "avatar" TEXT,
    "controlHookText" TEXT,
    "controlBodyText" TEXT,
    "alignmentScore" DOUBLE PRECISION,
    "alignmentVerdict" TEXT,
    "visualDiffVerdict" TEXT,
    "andromedaRisk" TEXT,
    "andromedaOverrideChosen" BOOLEAN NOT NULL DEFAULT false,
    "citations" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HookConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HookAnalysis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "inputTextHook" TEXT NOT NULL,
    "controlHookText" TEXT,
    "controlBodyText" TEXT,
    "imageUrl" TEXT,
    "product" TEXT,
    "audience" TEXT,
    "scoreStopScroll" INTEGER NOT NULL,
    "scoreCuriosity" INTEGER NOT NULL,
    "scoreBenefit" INTEGER NOT NULL,
    "scoreAlignment" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "reasoning" JSONB NOT NULL,
    "rewrites" JSONB NOT NULL,
    "andromedaRisk" TEXT NOT NULL,
    "andromedaReasoning" TEXT,
    "citations" JSONB NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HookAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HookProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "desire" TEXT NOT NULL,
    "awarenessDefault" TEXT,
    "sophisticationDefault" INTEGER,
    "language" TEXT NOT NULL DEFAULT 'both',
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HookProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HookWinner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metaAdId" TEXT NOT NULL,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "textHook" TEXT NOT NULL,
    "body" TEXT,
    "creativeType" TEXT,
    "visualSummary" TEXT,
    "dominantAttributes" JSONB,
    "spend" DOUBLE PRECISION,
    "purchaseRoas" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION,
    "linkClicks" INTEGER,
    "impressions" INTEGER,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "cachedUntil" TIMESTAMP(3) NOT NULL,
    "warnings" JSONB,

    CONSTRAINT "HookWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HookConcept_tenantId_status_createdAt_idx" ON "HookConcept"("tenantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HookConcept_tenantId_generationId_idx" ON "HookConcept"("tenantId", "generationId");

-- CreateIndex
CREATE INDEX "HookConcept_parentConceptId_idx" ON "HookConcept"("parentConceptId");

-- CreateIndex
CREATE INDEX "HookAnalysis_tenantId_createdAt_idx" ON "HookAnalysis"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HookProfile_tenantId_key" ON "HookProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HookWinner_tenantId_metaAdId_key" ON "HookWinner"("tenantId", "metaAdId");

-- CreateIndex
CREATE INDEX "HookWinner_tenantId_cachedUntil_idx" ON "HookWinner"("tenantId", "cachedUntil");

-- AddForeignKey
ALTER TABLE "HookConcept" ADD CONSTRAINT "HookConcept_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookConcept" ADD CONSTRAINT "HookConcept_parentConceptId_fkey" FOREIGN KEY ("parentConceptId") REFERENCES "HookConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookAnalysis" ADD CONSTRAINT "HookAnalysis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookProfile" ADD CONSTRAINT "HookProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookWinner" ADD CONSTRAINT "HookWinner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

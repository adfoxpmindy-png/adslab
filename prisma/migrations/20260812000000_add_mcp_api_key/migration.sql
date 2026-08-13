-- Add MCP API key column to Tenant. Stores the SHA-256 hash of the
-- plaintext key (which is shown to the user only once at issue time via
-- scripts/mcp-issue-key.ts). The /api/mcp endpoint hashes the incoming
-- Bearer header and looks it up here.
ALTER TABLE "Tenant" ADD COLUMN "mcpApiKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_mcpApiKey_key" ON "Tenant"("mcpApiKey");

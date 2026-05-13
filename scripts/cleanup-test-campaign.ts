import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

(async () => {
  const id = process.argv[2];
  if (!id) {
    console.log("Usage: tsx scripts/cleanup-test-campaign.ts <metaCampaignId>");
    process.exit(1);
  }
  const p = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });
  const { graphFetch } = await import("../src/lib/meta/graph-api");
  const { getFreshAccessToken } = await import("../src/lib/meta/client");
  const c = await p.metaConnection.findFirst({
    where: { status: "ACTIVE" },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!c) throw new Error("no connection");
  const t = await getFreshAccessToken(c);
  try {
    await graphFetch(`/${id}`, { method: "DELETE", accessToken: t });
    console.log(`✓ deleted ${id}`);
  } catch (e) {
    console.log(`✗ ${(e as Error).message}`);
  }
  await p.metaCampaign.deleteMany({ where: { metaCampaignId: id } });
  process.exit(0);
})();

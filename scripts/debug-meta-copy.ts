// Debug script — directly call Meta /copies to see full error body
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

(async () => {
  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  const { getFreshAccessToken } = await import("../src/lib/meta/client");

  const conn = await prisma.metaConnection.findFirst({
    where: { status: "ACTIVE" },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!conn) throw new Error("no connection");
  const accessToken = await getFreshAccessToken(conn);

  // Try several different campaigns to find one that /copies accepts
  const candidates = await prisma.metaCampaign.findMany({
    where: {
      connection: { tenantId: conn.tenantId },
      effectiveStatus: { in: ["ACTIVE", "PAUSED"] },
    },
    take: 10,
    orderBy: { lastFetchedAt: "desc" },
    select: { id: true, metaCampaignId: true, name: true, metaObjective: true, effectiveStatus: true, dailyBudget: true, lifetimeBudget: true },
  });

  console.log(`Testing /copies on ${candidates.length} candidate campaigns...\n`);

  for (const c of candidates) {
    const url = new URL(`https://graph.facebook.com/v23.0/${c.metaCampaignId}/copies`);
    url.searchParams.set("deep_copy", "true");
    url.searchParams.set("status_option", "PAUSED");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString(), { method: "POST" });
    const text = await res.text();
    if (res.ok) {
      console.log(`✓ SUCCESS for "${c.name}" (${c.metaObjective}, ${c.effectiveStatus}, budget mode: ${c.dailyBudget ? "daily" : c.lifetimeBudget ? "lifetime" : "ABO"})`);
      console.log(`  Response: ${text}`);
      const json = JSON.parse(text);
      // CLEANUP
      if (json.copied_campaign_id) {
        const delUrl = new URL(`https://graph.facebook.com/v23.0/${json.copied_campaign_id}`);
        delUrl.searchParams.set("access_token", accessToken);
        await fetch(delUrl.toString(), { method: "DELETE" });
        console.log(`  ✓ cleaned up ${json.copied_campaign_id}`);
      }
      break;
    } else {
      console.log(`✗ FAIL for "${c.name}" (${c.metaObjective}, ${c.effectiveStatus})`);
      console.log(`  status=${res.status} body=${text.slice(0, 600)}\n`);
    }
  }
  process.exit(0);
})();

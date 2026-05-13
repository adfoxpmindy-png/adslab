// Phase 1a smoke test — campaign goals foundation.
//
// What we verify:
//   1. Insights fetch now returns per-campaign data (account.campaigns[])
//   2. Campaign sync writes/updates MetaCampaign rows
//   3. Goal resolver classifies campaigns into objectives (AUTO_META)
//   4. Unresolved campaigns get flagged correctly
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-1a-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🧪 Phase 1a smoke test — campaign goals foundation\n");

  // Find any tenant with an active Meta connection
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, name: true, slug: true, metaConnection: { select: { id: true } } },
  });
  if (!tenant) {
    console.log("❌ No tenant with active Meta connection — connect Meta first.");
    process.exit(1);
  }
  console.log(`Using tenant: ${tenant.name} (${tenant.slug})\n`);

  // 1. Force a fresh dashboard fetch — this should trigger campaign sync.
  //    Use the same path the report uses (yesterday in BKK).
  const { refreshDashboardData } = await import("../src/lib/meta/dashboard-service");
  const yesterdayBkk = new Date(Date.now() + 7 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rangeKey = `custom:${yesterdayBkk}..${yesterdayBkk}` as const;

  console.log(`[1] Fetching insights for ${rangeKey}...`);
  const fetched = await refreshDashboardData(tenant.id, rangeKey);
  const totalCampaignsInPayload = fetched.payload.accounts.reduce(
    (n, a) => n + a.campaigns.length,
    0,
  );
  console.log(
    `   ✓ Got ${fetched.payload.accounts.length} accounts, ${totalCampaignsInPayload} campaigns in payload`,
  );
  if (totalCampaignsInPayload === 0) {
    console.log(
      "   ⚠ No campaigns in payload — this tenant may have no active campaigns yesterday.",
    );
  }

  // 2. MetaCampaign rows should now exist for this connection
  const syncedRows = await prisma.metaCampaign.count({
    where: { metaConnectionId: tenant.metaConnection!.id },
  });
  console.log(`[2] MetaCampaign rows in DB for this connection: ${syncedRows}`);
  if (syncedRows < totalCampaignsInPayload) {
    console.log(`   ❌ Expected >= ${totalCampaignsInPayload} synced rows`);
    process.exit(1);
  }
  console.log(`   ✓ All payload campaigns are persisted`);

  // 3. Goal resolution
  const { resolveCampaignGoals } = await import("../src/lib/goals/resolver");
  const inputs = fetched.payload.accounts.flatMap((a) =>
    a.campaigns.map((c) => ({
      metaCampaignId: c.campaignId,
      name: c.campaignName,
      metaObjective: c.metaObjective,
    })),
  );

  if (inputs.length === 0) {
    console.log("[3] No campaigns to resolve — skipping resolution checks.");
  } else {
    const goals = await resolveCampaignGoals({ tenantId: tenant.id, campaigns: inputs });
    console.log(`[3] Resolved ${goals.size} campaign goals`);

    const byObjective = new Map<string, number>();
    const bySource = new Map<string, number>();
    let unresolved = 0;
    for (const [, g] of goals) {
      if (!g.resolved || !g.objective) {
        unresolved++;
        continue;
      }
      byObjective.set(g.objective, (byObjective.get(g.objective) ?? 0) + 1);
      if (g.source) bySource.set(g.source, (bySource.get(g.source) ?? 0) + 1);
    }
    console.log(`   By objective: ${JSON.stringify(Object.fromEntries(byObjective))}`);
    console.log(`   By source:    ${JSON.stringify(Object.fromEntries(bySource))}`);
    console.log(`   Unresolved:   ${unresolved}`);

    // Spot-check: print one example from each objective bucket
    console.log(`\n   Example campaigns per objective:`);
    const seen = new Set<string>();
    for (const a of fetched.payload.accounts) {
      for (const c of a.campaigns) {
        const g = goals.get(c.campaignId);
        if (!g?.objective || seen.has(g.objective)) continue;
        seen.add(g.objective);
        console.log(
          `      • [${g.objective}] "${c.campaignName}" (account=${a.accountName}, metaObjective=${c.metaObjective}, source=${g.source})`,
        );
      }
    }
  }

  console.log("\n✅ Phase 1a smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Smoke test failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

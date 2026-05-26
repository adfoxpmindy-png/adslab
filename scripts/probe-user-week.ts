/**
 * Probe AdsLab DB for FROST Magical Ice Of Siam activity Thu-Mon
 * (2026-05-21 to 2026-05-25) — narrowed to a single ad account.
 *
 *   - Daily AI reports per day (whole-tenant, FROST mentions extracted)
 *   - AI recommendations per day where the target = FROST campaign
 *   - Auto-rule events per day for FROST campaigns/ads
 *   - Top / bottom engagement campaigns in FROST over the window
 *
 * Run: npx dotenv -e .env.local -- tsx scripts/probe-user-week.ts
 */
import { prisma } from "@/lib/prisma";

const FROST_ACCOUNT_ID = "act_1856743671701430";
const FROST_NAME = "FROST Magical Ice Of Siam";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "test@test.com" },
    select: {
      memberships: {
        select: { tenant: { select: { id: true, name: true, slug: true } } },
      },
    },
  });
  if (!user || user.memberships.length === 0) {
    console.log("user not found");
    return;
  }
  const tenant = user.memberships[0].tenant;
  console.log(`Tenant: ${tenant.name} [${tenant.slug}]`);
  console.log(`Filter to account: ${FROST_NAME} (${FROST_ACCOUNT_ID})`);

  const startBkk = new Date("2026-05-20T17:00:00Z");
  const endBkk = new Date("2026-05-25T16:59:59Z");
  console.log(`Window (BKK): Thu 21 → Mon 25 พ.ค.\n`);

  // Resolve FROST's campaign IDs so we can filter AI recs + event log
  const frostCampaigns = await prisma.metaCampaign.findMany({
    where: {
      connection: { tenantId: tenant.id },
      metaAccountId: FROST_ACCOUNT_ID,
    },
    select: { metaCampaignId: true, name: true, effectiveStatus: true },
  });
  console.log(`FROST has ${frostCampaigns.length} cached campaigns`);
  const frostCampaignIds = new Set(frostCampaigns.map((c) => c.metaCampaignId));

  // 1. Daily reports — show every day's FROST-relevant excerpt
  console.log(`\n[1] Daily Reports — FROST-related excerpts:`);
  const reports = await prisma.dailyReport.findMany({
    where: {
      tenantId: tenant.id,
      reportDate: { gte: new Date("2026-05-21"), lte: new Date("2026-05-25") },
    },
    orderBy: { reportDate: "asc" },
    select: {
      reportDate: true,
      status: true,
      contentMd: true,
      suggestedActions: true,
    },
  });
  for (const r of reports) {
    const d = r.reportDate.toISOString().slice(0, 10);
    console.log(`\n  === ${d} ===`);
    // Find FROST mentions in markdown
    const md = r.contentMd ?? "";
    const frostLines: string[] = [];
    const lines = md.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("FROST") || lines[i].includes("Magical")) {
        // include 2 lines before + 4 after for context
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 5);
        frostLines.push(lines.slice(start, end).join("\n"));
        i = end - 1;
      }
    }
    if (frostLines.length === 0) {
      console.log(`  (no FROST mentions in report markdown)`);
    } else {
      console.log(frostLines.join("\n  ---\n").slice(0, 2000));
    }

    // Filter suggested actions to FROST
    if (Array.isArray(r.suggestedActions)) {
      const frostActions = (r.suggestedActions as Array<Record<string, unknown>>).filter((a) => {
        const json = JSON.stringify(a).toLowerCase();
        return json.includes("frost") || json.includes("magical");
      });
      if (frostActions.length > 0) {
        console.log(`\n  FROST suggested actions (${frostActions.length}):`);
        for (const a of frostActions) {
          const txt = JSON.stringify(a).slice(0, 200);
          console.log(`    - ${txt}${txt.length === 200 ? "..." : ""}`);
        }
      }
    }
  }

  // 2. AI recommendations targeting FROST campaigns
  console.log(`\n\n[2] AI Recommendations targeting FROST campaigns:`);
  const recs = await prisma.aIRecommendation.findMany({
    where: {
      tenantId: tenant.id,
      createdAt: { gte: startBkk, lte: endBkk },
      targetKind: "CAMPAIGN",
      targetMetaId: { in: Array.from(frostCampaignIds) },
    },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      source: true,
      actionType: true,
      targetMetaId: true,
      reasoning: true,
      outcome: true,
    },
  });
  console.log(`  ${recs.length} recommendations for FROST campaigns in window`);
  for (const r of recs) {
    const camp = frostCampaigns.find((c) => c.metaCampaignId === r.targetMetaId);
    console.log(
      `\n  - ${r.createdAt.toISOString().slice(0, 16)}  ${r.source}/${r.actionType}`,
    );
    console.log(`    campaign: ${camp?.name ?? "?"} (${r.targetMetaId})`);
    if (r.reasoning) console.log(`    "${r.reasoning.slice(0, 200).replace(/\n/g, " ")}"`);
    if (r.outcome) console.log(`    outcome: ${JSON.stringify(r.outcome).slice(0, 100)}`);
  }

  // 3. Auto-rule events for FROST
  console.log(`\n\n[3] Auto-rule events on FROST:`);
  // EventLog payload may carry account/campaign info — scan all events in window
  // and grep payload for FROST_ACCOUNT_ID or FROST campaign IDs.
  const events = await prisma.eventLog.findMany({
    where: {
      tenantId: tenant.id,
      firedAt: { gte: startBkk, lte: endBkk },
    },
    orderBy: { firedAt: "asc" },
    select: {
      firedAt: true,
      eventName: true,
      ruleId: true,
      payload: true,
    },
  });
  const frostEvents = events.filter((e) => {
    const blob = JSON.stringify(e.payload ?? {});
    return (
      blob.includes(FROST_ACCOUNT_ID) ||
      blob.includes("1856743671701430") ||
      blob.toLowerCase().includes("frost") ||
      Array.from(frostCampaignIds).some((id) => blob.includes(id))
    );
  });
  console.log(
    `  ${frostEvents.length} of ${events.length} events relate to FROST (by payload scan)`,
  );
  for (const e of frostEvents.slice(0, 10)) {
    console.log(
      `  - ${e.firedAt.toISOString().slice(0, 16)}  ${e.eventName}  ruleId=${e.ruleId ?? "—"}`,
    );
  }

  // 4. Engagement leaders for FROST (filter cache to FROST account only)
  console.log(`\n\n[4] FROST Engagement leaders (cache last_7d):`);
  const cache = await prisma.metaInsightCache.findFirst({
    where: { tenantId: tenant.id, rangeKey: "last_7d" },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true, payload: true },
  });
  if (!cache) {
    console.log("  no cache");
    await prisma.$disconnect();
    return;
  }
  console.log(`  cache snapshot: ${cache.fetchedAt.toISOString()}`);

  const payload = cache.payload as {
    accounts?: Array<{
      accountId: string;
      accountName: string;
      spend?: number;
      impressions?: number;
      clicks?: number;
      ctr?: number;
      conversions?: number;
      purchaseValue?: number;
      campaigns?: Array<{
        campaignId: string;
        campaignName: string;
        metaObjective?: string | null;
        effectiveStatus?: string;
        spend?: number;
        impressions?: number;
        clicks?: number;
        ctr?: number;
        conversions?: number;
        purchaseValue?: number;
      }>;
    }>;
  };
  const frostAcc = payload.accounts?.find((a) => a.accountId === FROST_ACCOUNT_ID);
  if (!frostAcc) {
    console.log(`  FROST account (${FROST_ACCOUNT_ID}) not in cache payload`);
    await prisma.$disconnect();
    return;
  }
  console.log(
    `\n  Account totals (last 7d as of cache snap):  spend=฿${(frostAcc.spend ?? 0).toFixed(0)}  imp=${frostAcc.impressions ?? 0}  clicks=${frostAcc.clicks ?? 0}  CTR=${(frostAcc.ctr ?? 0).toFixed(2)}%  conversions=${frostAcc.conversions ?? 0}`,
  );

  const allCamps = frostAcc.campaigns ?? [];
  const active = allCamps.filter(
    (c) => c.effectiveStatus === "ACTIVE" && (c.impressions ?? 0) > 100,
  );
  console.log(`  ${allCamps.length} total campaigns, ${active.length} ACTIVE with >100 imp\n`);

  const byCtr = [...active].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));
  console.log("  TOP by CTR (engagement):");
  for (const c of byCtr.slice(0, 10)) {
    console.log(
      `    ${(c.ctr ?? 0).toFixed(2).padStart(6)}%  ${(c.clicks ?? 0).toString().padStart(6)} clk / ${(c.impressions ?? 0).toString().padStart(7)} imp  spend=฿${(c.spend ?? 0).toFixed(0).padStart(6)}  [${c.metaObjective ?? "—"}]  ${c.campaignName.slice(0, 60)}`,
    );
  }
  console.log("\n  BOTTOM by CTR (still active):");
  const bottom = byCtr.slice(-10).reverse();
  for (const c of bottom) {
    console.log(
      `    ${(c.ctr ?? 0).toFixed(2).padStart(6)}%  ${(c.clicks ?? 0).toString().padStart(6)} clk / ${(c.impressions ?? 0).toString().padStart(7)} imp  spend=฿${(c.spend ?? 0).toFixed(0).padStart(6)}  [${c.metaObjective ?? "—"}]  ${c.campaignName.slice(0, 60)}`,
    );
  }

  // Channel split — infer from campaign name (FB / IG keywords)
  console.log("\n  Channel split (inferred from campaign name):");
  let fbCount = 0, fbCtr = 0, fbImp = 0, fbClicks = 0;
  let igCount = 0, igCtr = 0, igImp = 0, igClicks = 0;
  for (const c of active) {
    const name = c.campaignName.toUpperCase();
    if (name.includes("IG") || name.includes("INSTAGRAM")) {
      igCount++; igImp += c.impressions ?? 0; igClicks += c.clicks ?? 0;
    } else {
      fbCount++; fbImp += c.impressions ?? 0; fbClicks += c.clicks ?? 0;
    }
  }
  fbCtr = fbImp > 0 ? (fbClicks / fbImp) * 100 : 0;
  igCtr = igImp > 0 ? (igClicks / igImp) * 100 : 0;
  console.log(`    FB-tagged: ${fbCount} campaigns  ${fbClicks}/${fbImp}  CTR ${fbCtr.toFixed(2)}%`);
  console.log(`    IG-tagged: ${igCount} campaigns  ${igClicks}/${igImp}  CTR ${igCtr.toFixed(2)}%`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

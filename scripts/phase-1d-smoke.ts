// Phase 1d smoke test — goal evaluation + targets.
//
// Verifies:
//   1. evaluator.ts maps each objective to its primary KPI + default target
//   2. evaluateCampaign returns on-track / off-track / no-data correctly
//   3. POST /api/goals accepts primaryKpi + primaryTarget
//   4. The persisted target is honored by evaluateCampaign on re-resolve
//   5. End-to-end: generate a daily report and verify it includes
//      goal/evaluation context in its payload snapshot
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-1d-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

type CookieJar = { value: string };

async function api(
  path: string,
  init: RequestInit & { cookieJar?: CookieJar } = {},
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.cookieJar?.value) headers.set("Cookie", init.cookieJar.value);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && init.cookieJar) {
    const m = setCookie.match(/^([^;]+)/);
    if (m) init.cookieJar.value = m[1];
  }
  let body: any = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) body = await res.json();
  else body = await res.text();
  return { status: res.status, body };
}

function assert(cond: any, label: string) {
  if (cond) console.log(`   ✓ ${label}`);
  else {
    console.log(`   ✗ ${label}`);
    process.exit(1);
  }
}

async function main() {
  console.log("\n🧪 Phase 1d smoke test — Goal evaluation + targets\n");

  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  // Unit-test the evaluator directly first
  const { evaluateCampaign, OBJECTIVE_SPECS } = await import("../src/lib/goals/evaluator");

  console.log("[1] Unit: evaluator default thresholds");
  assert(OBJECTIVE_SPECS.SALES.kpi === "ROAS", "SALES default KPI = ROAS");
  assert(OBJECTIVE_SPECS.SALES.defaultTarget === 2.5, "SALES default target = 2.5");
  assert(OBJECTIVE_SPECS.AWARENESS.kpi === "CPM", "AWARENESS default KPI = CPM");

  console.log("\n[2] Unit: evaluation status for fake insight");
  const fakeInsight = {
    campaignId: "x",
    campaignName: "x",
    metaObjective: null,
    effectiveStatus: "ACTIVE",
    configuredStatus: null,
    spend: 1000,
    impressions: 50000,
    clicks: 800,
    ctr: 1.6,
    cpm: 20,
    cpc: 1.25,
    conversions: 5,
    purchaseValue: 4000,
    roas: 4.0,
  };
  const salesEval = evaluateCampaign({
    objective: "SALES",
    primaryKpi: null,
    primaryTarget: null,
    insight: fakeInsight as any,
  });
  assert(salesEval?.status === "on-track", `Sales ROAS 4.0x ≥ 2.5 → on-track`);
  assert(salesEval?.actual === 4.0, "actual = 4.0");

  const awEval = evaluateCampaign({
    objective: "AWARENESS",
    primaryKpi: null,
    primaryTarget: null,
    insight: fakeInsight as any,
  });
  assert(awEval?.status === "on-track", `Awareness CPM 20 ≤ 50 → on-track`);

  // Off-track example
  const offEval = evaluateCampaign({
    objective: "SALES",
    primaryKpi: null,
    primaryTarget: null,
    insight: { ...fakeInsight, roas: 1.5 } as any,
  });
  assert(offEval?.status === "off-track", `Sales ROAS 1.5x < 2.5 → off-track`);

  // Custom target override
  const customEval = evaluateCampaign({
    objective: "SALES",
    primaryKpi: "ROAS",
    primaryTarget: 5.0,
    insight: fakeInsight as any,
  });
  assert(customEval?.status === "off-track", `Sales ROAS 4.0 < custom target 5.0 → off-track`);
  assert(customEval?.customTarget === true, "customTarget flag set");

  // No-data case
  const zeroSpend = evaluateCampaign({
    objective: "SALES",
    primaryKpi: null,
    primaryTarget: null,
    insight: { ...fakeInsight, spend: 0, roas: 0 } as any,
  });
  assert(zeroSpend?.status === "no-data", `Zero-spend Sales → no-data`);

  // 3. Persist a target via the API and verify it survives a round-trip
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: {
      id: true,
      slug: true,
      members: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true } } },
        take: 1,
      },
    },
  });
  if (!tenant) {
    console.log("❌ No tenant with active Meta connection");
    process.exit(1);
  }
  const ownerEmail = tenant.members[0].user.email;

  console.log("\n[3] API: persist primaryTarget via POST /api/goals");
  const jar: CookieJar = { value: "" };
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ownerEmail, password: "admin123" }),
    cookieJar: jar,
  });
  assert(login.status === 200, "login OK");

  const target = await prisma.metaCampaign.findFirst({
    where: { connection: { tenantId: tenant.id }, metaObjective: { not: null } },
    select: { id: true, metaCampaignId: true, name: true },
  });
  if (!target) {
    console.log("❌ No suitable campaign");
    process.exit(1);
  }

  const post = await api(`/api/goals?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({
      campaignId: target.id,
      objective: "SALES",
      primaryKpi: "ROAS",
      primaryTarget: 7.5,
    }),
    cookieJar: jar,
  });
  assert(post.status === 200, "POST OK");
  assert(post.body.goal.primaryKpi === "ROAS", "saved primaryKpi=ROAS");
  assert(post.body.goal.primaryTarget === 7.5, "saved primaryTarget=7.5");

  // 4. Resolve and ensure target round-trips
  console.log("\n[4] Resolver returns custom target");
  const { resolveCampaignGoals } = await import("../src/lib/goals/resolver");
  const resolved = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: [
      {
        metaCampaignId: target.metaCampaignId,
        name: target.name,
        metaObjective: null,
      },
    ],
  });
  const g = resolved.get(target.metaCampaignId);
  assert(g?.primaryKpi === "ROAS", "resolver primaryKpi=ROAS");
  assert(g?.primaryTarget === 7.5, "resolver primaryTarget=7.5");
  assert(g?.source === "USER_MANUAL", "source=USER_MANUAL");

  // 5. Cleanup the override
  await api(`/api/goals?tenantSlug=${tenant.slug}&campaignId=${target.id}`, {
    method: "DELETE",
    cookieJar: jar,
  });
  console.log("   ✓ Cleaned up");

  // 6. End-to-end: AI prompt now includes evaluation
  console.log("\n[5] End-to-end: build user message and confirm 'evaluation' field present");
  const { refreshDashboardData } = await import("../src/lib/meta/dashboard-service");
  const yesterday = new Date(Date.now() + 7 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dashboard = await refreshDashboardData(
    tenant.id,
    `custom:${yesterday}..${yesterday}` as any,
  );
  const allCampaigns = dashboard.payload.accounts.flatMap((a) =>
    a.campaigns.map((c) => ({
      metaCampaignId: c.campaignId,
      name: c.campaignName,
      metaObjective: c.metaObjective,
    })),
  );
  const goals = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: allCampaigns,
  });
  const { buildDailyReportUserMessage } = await import("../src/lib/reports/prompt");
  const userMsg = buildDailyReportUserMessage({
    tenantName: "Test",
    dateLabel: "test",
    today: dashboard.payload,
    prevDay: null,
    goalsByCampaignId: goals,
    scopeName: null,
  });
  assert(userMsg.includes('"evaluation"'), "user message contains evaluation field");
  assert(
    userMsg.includes('"status": "on-track"') || userMsg.includes('"status": "off-track"'),
    "at least one campaign has a status",
  );

  console.log("\n✅ Phase 1d smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Smoke test failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

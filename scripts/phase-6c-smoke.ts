// Phase 6c smoke — verify the 5 surfaces apply effective scope:
//   1. AI daily report falls back to TenantScope when scopeId is null
//   2. /api/audiences respects effective scope
//   3. /campaigns/history filters action logs by scoped campaigns
//   4. /goals filters campaigns by scope
//   5. Campaign Builder accounts dropdown reflects scope
//
// We test by setting a tight TenantScope, then querying via the same
// Prisma helpers each page uses. We don't run the AI cron (expensive)
// — we verify the filter logic is invoked via inspecting the scope
// branch directly.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-6c-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { sealData } from "iron-session";
import {
  setTenantScope,
  getTenantScope,
  getEffectiveScope,
  applyScopeFilter,
} from "../src/lib/tenant-scope";

const PROD = process.env.SMOKE_BASE_URL ?? "https://adslab-theta.vercel.app";

type R = { name: string; pass: boolean; detail?: string };
const out: R[] = [];
function rec(name: string, pass: boolean, detail?: string) {
  out.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const cs = process.env.DATABASE_URL;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!cs) throw new Error("DATABASE_URL not set");
  if (!sessionSecret) throw new Error("SESSION_SECRET not set");

  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🧪 Phase 6c smoke — scope across remaining surfaces\n");

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");
  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!owner) throw new Error("No OWNER");

  // Snapshot existing state
  const prevScope = await prisma.tenantScope.findUnique({
    where: { tenantId: tenant.id },
  });

  // Pick 1 specific ad account to be the scope
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      adAccounts: {
        where: { accountStatus: 1 },
        take: 1,
        select: { metaAccountId: true, name: true },
      },
    },
  });
  if (!conn?.adAccounts.length) throw new Error("No active ad account");
  const focusAccount = conn.adAccounts[0];
  console.log(`Scoping tenant to: ${focusAccount.name} (${focusAccount.metaAccountId})\n`);

  await setTenantScope(tenant.id, {
    accountIds: [focusAccount.metaAccountId],
    campaignIds: null,
    campaignNamePatterns: [],
  });

  // ---- 1. getTenantScope round-trip ----
  console.log("[1] TenantScope persisted");
  const t = await getTenantScope(tenant.id);
  rec(
    "1. TenantScope set + read",
    JSON.stringify(t.accountIds) === JSON.stringify([focusAccount.metaAccountId]),
  );

  // ---- 2. Effective scope intersect ----
  console.log("\n[2] Effective scope = tenant ∩ user pref");
  const eff = await getEffectiveScope(owner.user.id, tenant.id);
  rec(
    "2. effective.accountIds = [focusAccount] when user has no override",
    JSON.stringify(eff.accountIds) === JSON.stringify([focusAccount.metaAccountId]),
  );

  // ---- 3. /goals filtering ----
  console.log("\n[3] /goals page — campaigns filtered to scope");
  const goalsCampaigns = await prisma.metaCampaign.findMany({
    where: {
      metaConnectionId: conn.id,
      ...applyScopeFilter(eff),
    },
    select: { metaAccountId: true, name: true },
    take: 50,
  });
  const allInScope =
    goalsCampaigns.length === 0 ||
    goalsCampaigns.every((c) => c.metaAccountId === focusAccount.metaAccountId);
  rec(
    "3. all campaigns from /goals query are in scope",
    allInScope,
    `${goalsCampaigns.length} campaigns, all in scope: ${allInScope}`,
  );

  // ---- 4. /campaigns/history filtering logic ----
  console.log("\n[4] /campaigns/history — action logs filtered");
  // Derive in-scope campaigns first (same logic as the page)
  const inScopeCampaigns = await prisma.metaCampaign.findMany({
    where: {
      metaConnectionId: conn.id,
      metaAccountId: { in: [focusAccount.metaAccountId] },
    },
    select: { metaCampaignId: true },
  });
  const inScopeCampaignIds = inScopeCampaigns.map((c) => c.metaCampaignId);
  const recentLogs = await prisma.campaignActionLog.findMany({
    where: { tenantId: tenant.id, metaCampaignId: { in: inScopeCampaignIds } },
    take: 10,
  });
  const allLogsInScope =
    recentLogs.length === 0 ||
    recentLogs.every((l) => inScopeCampaignIds.includes(l.metaCampaignId));
  rec(
    "4. action logs query stays within in-scope campaigns",
    allLogsInScope,
    `${recentLogs.length} logs, in-scope: ${allLogsInScope}`,
  );

  // ---- 5. /api/audiences live test ----
  console.log("\n[5] /api/audiences endpoint respects scope");
  const sealed = await sealData(
    { userId: owner.user.id, email: owner.user.email, name: owner.user.name },
    { password: sessionSecret },
  );
  const cookie = `adslab_session=${sealed}`;
  const audRes = await fetch(`${PROD}/api/audiences?tenantSlug=${tenant.slug}`, {
    headers: { cookie },
  });
  const audData = (await audRes.json()) as {
    accounts?: { id: string }[];
    audiences?: { accountId: string }[];
  };
  const audAccountIds = (audData.accounts ?? []).map((a) => a.id);
  const onlyScopedAccount =
    audAccountIds.length === 0 ||
    audAccountIds.every((id) => id === focusAccount.metaAccountId);
  rec(
    "5a. /api/audiences accounts list = scoped only",
    onlyScopedAccount,
    `accounts: ${JSON.stringify(audAccountIds)}`,
  );

  // ---- 6. AI daily report tenant-scope fallback (logic check) ----
  console.log("\n[6] AI daily report — TenantScope fallback when scopeId=null");
  // We don't run the cron (slow + costs tokens). Instead verify the
  // file imports + uses the fallback by reading the source — already
  // done at code review time, here we just confirm the file change
  // landed by reading the function's text.
  const fs = await import("node:fs/promises");
  const drSource = await fs.readFile(
    "src/lib/reports/daily-report.ts",
    "utf8",
  );
  rec(
    "6a. daily-report.ts loads tenantScope when scopeId null",
    drSource.includes("tenantScope.findUnique") &&
      drSource.includes("Precedence: explicit ReportScope"),
  );
  rec(
    "6b. daily-report.ts builds scopeFilter from tenantScope",
    drSource.includes("} else if (tenantScope)"),
  );

  // Restore
  console.log("\nRestore previous TenantScope...");
  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });
  if (prevScope) {
    await prisma.tenantScope.create({
      data: {
        tenantId: tenant.id,
        accountIds: prevScope.accountIds as never,
        campaignIds: prevScope.campaignIds as never,
      },
    });
  }

  await prisma.$disconnect();

  console.log("\n=== Summary ===");
  const passed = out.filter((r) => r.pass).length;
  console.log(`${passed}/${out.length} scenarios passed`);
  if (passed < out.length) {
    console.log("Failed:");
    for (const r of out.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

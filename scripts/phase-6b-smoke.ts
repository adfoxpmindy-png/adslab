// Phase 6b smoke test â€” Tenant-level scope.
//
// Scenarios:
//   A. TenantScope round-trip: set/get with both null + arrays
//   B. getEffectiveScope: null+null â†’ null
//   C. getEffectiveScope: tenant=[a,b] + user=null â†’ [a,b]
//   D. getEffectiveScope: tenant=null + user=[a] â†’ [a]
//   E. getEffectiveScope: tenant=[a,b,c] + user=[b,d] â†’ [b] (intersection)
//   F. applyScopeFilter: builds correct Prisma where fragments
//   G. campaignIds carried through (tenant only â€” no user override)
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-6b-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  getTenantScope,
  setTenantScope,
  getEffectiveScope,
  applyScopeFilter,
} from "../src/lib/tenant-scope";
import { setSelectedAccountIds } from "../src/lib/account-preference";

type R = { name: string; pass: boolean; detail?: string };
const out: R[] = [];
function rec(name: string, pass: boolean, detail?: string) {
  out.push({ name, pass, detail });
  console.log(`  ${pass ? "âœ“" : "âœ—"} ${name}${detail ? ` â€” ${detail}` : ""}`);
}

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\nðŸ§ª Phase 6b smoke â€” Tenant Scope\n");

  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("No tenant");
  const member = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id },
    select: { userId: true },
  });
  if (!member) throw new Error("No tenant member");

  // Clean state
  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.userAccountPreference.deleteMany({
    where: { userId: member.userId, tenantId: tenant.id },
  });

  // ---- A. round-trip ---------------------------------------------
  console.log("[A] TenantScope round-trip");
  const empty = await getTenantScope(tenant.id);
  rec(
    "A1. no row â†’ accountIds=null, campaignIds=null",
    empty.accountIds === null && empty.campaignIds === null,
  );

  await setTenantScope(tenant.id, {
    accountIds: ["act_1", "act_2"],
    campaignIds: ["c1"],
    campaignNamePatterns: [],
  });
  const round = await getTenantScope(tenant.id);
  rec(
    "A2. set + get preserves arrays",
    JSON.stringify(round.accountIds) === JSON.stringify(["act_1", "act_2"]) &&
      JSON.stringify(round.campaignIds) === JSON.stringify(["c1"]),
  );

  await setTenantScope(tenant.id, { accountIds: null, campaignIds: null , campaignNamePatterns: [] });
  const cleared = await getTenantScope(tenant.id);
  rec(
    "A3. set null â†’ reads null",
    cleared.accountIds === null && cleared.campaignIds === null,
  );

  // ---- B. effective scope: null+null --------------------------
  console.log("\n[B-E] getEffectiveScope merging");
  const both = await getEffectiveScope(member.userId, tenant.id);
  rec(
    "B. null tenant + null user â†’ null (no constraint)",
    both.accountIds === null,
  );

  // ---- C. tenant set, user null -------------------------------
  await setTenantScope(tenant.id, {
    accountIds: ["a", "b"],
    campaignIds: null,
    campaignNamePatterns: [],
  });
  const tOnly = await getEffectiveScope(member.userId, tenant.id);
  rec(
    "C. tenant=[a,b] + user=null â†’ [a,b]",
    JSON.stringify(tOnly.accountIds) === JSON.stringify(["a", "b"]),
  );

  // ---- D. tenant null, user set -------------------------------
  await setTenantScope(tenant.id, { accountIds: null, campaignIds: null , campaignNamePatterns: [] });
  await setSelectedAccountIds(member.userId, tenant.id, ["a"]);
  const uOnly = await getEffectiveScope(member.userId, tenant.id);
  rec(
    "D. tenant=null + user=[a] â†’ [a]",
    JSON.stringify(uOnly.accountIds) === JSON.stringify(["a"]),
  );

  // ---- E. both set: intersection ------------------------------
  await setTenantScope(tenant.id, {
    accountIds: ["a", "b", "c"],
    campaignIds: ["k1"],
    campaignNamePatterns: [],
  });
  await setSelectedAccountIds(member.userId, tenant.id, ["b", "d"]);
  const both2 = await getEffectiveScope(member.userId, tenant.id);
  rec(
    "E. tenant=[a,b,c] + user=[b,d] â†’ [b] (intersect)",
    JSON.stringify(both2.accountIds) === JSON.stringify(["b"]),
    JSON.stringify(both2.accountIds),
  );
  rec(
    "G. campaignIds carried from tenant",
    JSON.stringify(both2.campaignIds) === JSON.stringify(["k1"]),
  );

  // ---- F. applyScopeFilter -----------------------------------
  console.log("\n[F] applyScopeFilter");
  const f1 = applyScopeFilter({ accountIds: null, campaignIds: null });
  rec("F1. null both â†’ empty where", Object.keys(f1).length === 0);

  const f2 = applyScopeFilter({ accountIds: ["a"], campaignIds: null });
  rec(
    "F2. accountIds only",
    !!f2.metaAccountId && !f2.metaCampaignId,
    JSON.stringify(f2),
  );

  const f3 = applyScopeFilter({ accountIds: ["a"], campaignIds: ["c1"] });
  rec(
    "F3. both â†’ both filters",
    !!f3.metaAccountId && !!f3.metaCampaignId,
    JSON.stringify(f3),
  );

  // Cleanup
  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.userAccountPreference.deleteMany({
    where: { userId: member.userId, tenantId: tenant.id },
  });

  console.log("\n=== Summary ===");
  const passed = out.filter((r) => r.pass).length;
  console.log(`${passed}/${out.length} scenarios passed`);
  if (passed < out.length) {
    console.log("Failed:");
    for (const r of out.filter((r) => !r.pass)) {
      console.log(`  âœ— ${r.name}${r.detail ? ` â€” ${r.detail}` : ""}`);
    }
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


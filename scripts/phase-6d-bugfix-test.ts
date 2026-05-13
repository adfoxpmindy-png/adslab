// Smoke test for the two bugs reported by user:
//   1. AccountPicker showed "0/21" when user pref was [] (legacy)
//   2. /api/meta/insights returned unfiltered data on range switch
//
// Approach: set TenantScope to 1 account, set user pref to [] (legacy
// stuck state), then hit /api/meta/insights and verify it returns only
// scoped accounts. Also verify getSelectedAccountIds normalizes [].
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-6d-bugfix-test.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { sealData } from "iron-session";
import {
  getSelectedAccountIds,
  setSelectedAccountIds,
} from "../src/lib/account-preference";
import { setTenantScope } from "../src/lib/tenant-scope";

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

  console.log("\n🧪 Phase 6d bugfix smoke\n");

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

  // Snapshot
  const prevTenantScope = await prisma.tenantScope.findUnique({
    where: { tenantId: tenant.id },
  });
  const prevUserPref = await prisma.userAccountPreference.findUnique({
    where: {
      userId_tenantId: { userId: owner.user.id, tenantId: tenant.id },
    },
  });

  // ---- Setup test state ----
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      adAccounts: {
        where: { accountStatus: 1 },
        take: 1,
        select: { metaAccountId: true, name: true },
      },
    },
  });
  if (!conn?.adAccounts.length) throw new Error("No active account");
  const focus = conn.adAccounts[0];

  await setTenantScope(tenant.id, {
    accountIds: [focus.metaAccountId],
    campaignIds: null,
    campaignNamePatterns: [],
  });
  // Set user pref to [] — simulates the legacy stuck state
  await setSelectedAccountIds(owner.user.id, tenant.id, []);

  // ---- Bug 1: [] normalized to null ----
  console.log("[1] Legacy [] user pref normalizes to null");
  const after = await getSelectedAccountIds(owner.user.id, tenant.id);
  rec(
    "1. getSelectedAccountIds returns null when stored []",
    after === null,
    JSON.stringify(after),
  );

  // ---- Bug 2: /api/meta/insights respects scope ----
  console.log("\n[2] /api/meta/insights applies effective scope");
  const sealed = await sealData(
    { userId: owner.user.id, email: owner.user.email, name: owner.user.name },
    { password: sessionSecret },
  );
  const cookie = `adslab_session=${sealed}`;

  for (const range of ["today", "yesterday", "last_7d"]) {
    const res = await fetch(
      `${PROD}/api/meta/insights?tenantSlug=${tenant.slug}&range=${range}`,
      { headers: { cookie } },
    );
    const data = (await res.json()) as {
      accounts?: { accountId: string }[];
    };
    const ids = (data.accounts ?? []).map((a) => a.accountId);
    const allInScope =
      ids.length === 0 || ids.every((id) => id === focus.metaAccountId);
    rec(
      `2. range=${range}: only scoped account in response`,
      allInScope,
      `accounts: ${JSON.stringify(ids)}`,
    );
  }

  // ---- Restore ----
  console.log("\nRestore...");
  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });
  if (prevTenantScope) {
    await prisma.tenantScope.create({
      data: {
        tenantId: tenant.id,
        accountIds: prevTenantScope.accountIds as never,
        campaignIds: prevTenantScope.campaignIds as never,
      },
    });
  }
  await prisma.userAccountPreference.deleteMany({
    where: { userId: owner.user.id, tenantId: tenant.id },
  });
  if (prevUserPref) {
    await prisma.userAccountPreference.create({
      data: {
        userId: owner.user.id,
        tenantId: tenant.id,
        selectedAccountIds: prevUserPref.selectedAccountIds as never,
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

// Smoke test for the report-scopes feature.
//
// Scenarios:
//   1. Unit: applyScopeFilter trims accounts AND re-aggregates
//   2. API CRUD: create / patch / delete scope
//   3. Generate a report for a scope → verify scopeId persisted + payload
//      snapshot only includes scope's accounts
//   4. Same date, scoped + full-tenant reports coexist (no unique collision)
//   5. Empty scope (no account/campaign filter) returns full data
//   6. Cleanup
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-scopes-smoke.ts
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
  console.log("\n🧪 Report scopes smoke test\n");

  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

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

  // Clean any leftover test scopes
  await prisma.reportScope.deleteMany({
    where: { tenantId: tenant.id, name: { startsWith: "[smoke]" } },
  });

  // === Unit: filter ============================================
  console.log("[1] Unit: applyScopeFilter");
  const { applyScopeFilter } = await import("../src/lib/reports/scope-filter");
  const fakePayload: any = {
    range: "last_7d",
    fetchedAt: new Date().toISOString(),
    summary: { spendThb: 0, impressions: 0, clicks: 0, conversions: 0, purchaseValueThb: 0, roas: 0, ctr: 0, cpm: 0 },
    accounts: [
      {
        accountId: "act_111",
        accountName: "Acc A",
        currency: "THB",
        businessName: null,
        accountStatus: 1,
        spend: 1000,
        impressions: 50000,
        clicks: 100,
        ctr: 0.2,
        cpm: 20,
        cpc: 10,
        frequency: 1,
        conversions: 5,
        purchaseValue: 4000,
        roas: 4,
        campaignObjectives: [],
        campaigns: [
          {
            campaignId: "c1",
            campaignName: "C1",
            metaObjective: "OUTCOME_SALES",
            effectiveStatus: "ACTIVE",
            configuredStatus: null,
            spend: 600,
            impressions: 30000,
            clicks: 60,
            ctr: 0.2,
            cpm: 20,
            cpc: 10,
            conversions: 3,
            purchaseValue: 2400,
            roas: 4,
          },
          {
            campaignId: "c2",
            campaignName: "C2",
            metaObjective: "OUTCOME_AWARENESS",
            effectiveStatus: "ACTIVE",
            configuredStatus: null,
            spend: 400,
            impressions: 20000,
            clicks: 40,
            ctr: 0.2,
            cpm: 20,
            cpc: 10,
            conversions: 2,
            purchaseValue: 1600,
            roas: 4,
          },
        ],
      },
      {
        accountId: "act_222",
        accountName: "Acc B",
        currency: "THB",
        businessName: null,
        accountStatus: 1,
        spend: 500,
        impressions: 10000,
        clicks: 20,
        ctr: 0.2,
        cpm: 50,
        cpc: 25,
        frequency: 1,
        conversions: 1,
        purchaseValue: 100,
        roas: 0.2,
        campaignObjectives: [],
        campaigns: [],
      },
    ],
  };

  // Account filter
  const onlyA = applyScopeFilter(fakePayload, { accountIds: ["act_111"], campaignIds: [] });
  assert(onlyA.accounts.length === 1, "account filter → 1 account");
  assert(onlyA.summary.spendThb === 1000, `summary aggregated spendThb=1000 (got ${onlyA.summary.spendThb})`);

  // Campaign filter (within account A)
  const onlyC1 = applyScopeFilter(fakePayload, { accountIds: [], campaignIds: ["c1"] });
  assert(onlyC1.accounts.length === 1, "campaign filter drops account B (no matches)");
  assert(onlyC1.accounts[0].campaigns.length === 1, "1 campaign in result");
  assert(onlyC1.accounts[0].spend === 600, "account re-aggregated to campaign spend");
  assert(onlyC1.summary.spendThb === 600, "summary reflects only c1");

  // Empty filter = pass-through
  const empty = applyScopeFilter(fakePayload, { accountIds: [], campaignIds: [] });
  assert(empty.accounts.length === 2, "empty filter → all accounts");

  // === API: CRUD ============================================
  console.log("\n[2] API CRUD via /api/scopes");
  const jar: CookieJar = { value: "" };
  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ownerEmail, password: "admin123" }),
    cookieJar: jar,
  });

  // Pick one account to scope to
  const acc = await prisma.metaAdAccount.findFirst({
    where: { connection: { tenantId: tenant.id } },
    select: { metaAccountId: true, name: true },
  });
  if (!acc) {
    console.log("❌ No ad accounts to test");
    process.exit(1);
  }
  console.log(`   Scoping to account: ${acc.name} (${acc.metaAccountId})`);

  const create = await api(`/api/scopes?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({
      name: "[smoke] one-account",
      accountIds: [acc.metaAccountId],
      campaignIds: [],
    }),
    cookieJar: jar,
  });
  assert(create.status === 200, `POST scope status 200 (got ${create.status})`);
  const scopeId: string = create.body.scope.id;

  const list = await api(`/api/scopes?tenantSlug=${tenant.slug}`, { cookieJar: jar });
  assert(
    list.body.scopes.some((s: any) => s.id === scopeId),
    "GET shows new scope",
  );

  const patch = await api(`/api/scopes?tenantSlug=${tenant.slug}`, {
    method: "PATCH",
    body: JSON.stringify({ id: scopeId, name: "[smoke] one-account-v2" }),
    cookieJar: jar,
  });
  assert(patch.body.scope.name === "[smoke] one-account-v2", "PATCH renamed scope");

  // === Generate scoped report ============================================
  console.log("\n[3] Generate report scoped to one account");

  // Use a fresh date so we don't collide with existing reports.
  // Use a far-past date so AI sees "no data" and finishes fast.
  const testDate = "2026-04-15";
  await prisma.dailyReport.deleteMany({
    where: { tenantId: tenant.id, reportDate: new Date(`${testDate}T00:00:00.000Z`) },
  });

  const gen = await api(
    `/api/reports/generate?tenantSlug=${tenant.slug}&date=${testDate}&scopeId=${scopeId}`,
    { method: "POST", cookieJar: jar },
  );
  assert(gen.status === 200, `generate status 200 (got ${gen.status}, body=${JSON.stringify(gen.body).slice(0, 200)})`);

  const scopedReport = await prisma.dailyReport.findFirst({
    where: { tenantId: tenant.id, scopeId, reportDate: new Date(`${testDate}T00:00:00.000Z`) },
    select: { id: true, scopeId: true, payloadSnapshot: true, contentMd: true },
  });
  assert(scopedReport !== null, "scoped report row exists");
  assert(scopedReport!.scopeId === scopeId, "row has scopeId");

  const snap = scopedReport!.payloadSnapshot as any;
  const accountIdsInSnap = (snap?.accounts ?? []).map((a: any) => a.accountId);
  assert(
    accountIdsInSnap.length === 0 || accountIdsInSnap.every((id: string) => id === acc.metaAccountId),
    `snapshot only contains the scoped account (${accountIdsInSnap.join(",") || "empty"})`,
  );
  assert(
    snap?.scope?.id === scopeId,
    "snapshot.scope.id matches",
  );

  // === Same date, full-tenant report coexists ========================
  console.log("\n[4] Same date, full-tenant report (scopeId=null) should not collide");
  const genFull = await api(
    `/api/reports/generate?tenantSlug=${tenant.slug}&date=${testDate}`,
    { method: "POST", cookieJar: jar },
  );
  assert(genFull.status === 200, `full-tenant generate status 200 (got ${genFull.status})`);
  const fullReport = await prisma.dailyReport.findFirst({
    where: { tenantId: tenant.id, scopeId: null, reportDate: new Date(`${testDate}T00:00:00.000Z`) },
    select: { id: true },
  });
  assert(fullReport !== null, "full-tenant row exists alongside scoped row");

  // === Cleanup ============================================
  console.log("\n[5] Cleanup");
  await prisma.dailyReport.deleteMany({
    where: { tenantId: tenant.id, reportDate: new Date(`${testDate}T00:00:00.000Z`) },
  });
  const del = await api(`/api/scopes?tenantSlug=${tenant.slug}&id=${scopeId}`, {
    method: "DELETE",
    cookieJar: jar,
  });
  assert(del.status === 200, "DELETE scope OK");
  console.log("   ✓ cleaned up");

  console.log("\n✅ Scopes smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

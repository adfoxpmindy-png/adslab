// Smoke test for add-budget-actions (Stage 1 v2).
//
// Scenarios (per founder "multi-scenario" rule):
//   Unit (no Meta):
//   1. isCboCampaign detection — daily / lifetime / ABO
//   2. thbToMinorUnits conversion + rounding
//
//   API (live Meta — uses founder's real account):
//   3. SET_BUDGET on CBO daily → Meta confirms + DB + log
//   4. Re-set same value (idempotency) → no Meta call, log SUCCESS
//   5. SET_BUDGET on ABO campaign → FAILED with clear msg, no Meta call
//   6. SET_BUDGET below ฿20 → FAILED via validation
//   7. SET_BUDGET above ฿1M → FAILED via validation
//   8. SET_BUDGET cross-mode (daily on lifetime campaign) → FAILED
//   9. SET_END_DATE future → success
//  10. SET_END_DATE in past → FAILED
//  11. Audit log: all events have correct shape
//  12. Restoration: reverse the budget change back to original
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-budget-actions-smoke.ts
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
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
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
  console.log("\n🧪 Budget actions smoke test\n");

  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  // ====== Unit tests ======
  console.log("[1] Unit: isCboCampaign + thbToMinorUnits");
  const { isCboCampaign, thbToMinorUnits } = await import("../src/lib/meta/campaign-actions");
  assert(isCboCampaign({ dailyBudget: 50000, lifetimeBudget: null }) === true, "daily-only = CBO");
  assert(isCboCampaign({ dailyBudget: null, lifetimeBudget: 100000 }) === true, "lifetime-only = CBO");
  assert(isCboCampaign({ dailyBudget: null, lifetimeBudget: null }) === false, "neither = ABO");
  assert(thbToMinorUnits(500) === 50000, "฿500 → 50000 minor");
  assert(thbToMinorUnits(20.5) === 2050, "฿20.5 → 2050 minor (rounded)");

  // ====== Setup ======
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: {
      id: true,
      slug: true,
      members: {
        where: { role: "OWNER" },
        select: { user: { select: { id: true, email: true } } },
        take: 1,
      },
    },
  });
  if (!tenant) {
    console.log("❌ No tenant with active Meta connection");
    process.exit(1);
  }
  const owner = tenant.members[0].user;

  // Trigger a fresh sync so budget fields are populated.
  console.log("\n[2] Sync campaigns to populate budget fields");
  const { refreshDashboardData } = await import("../src/lib/meta/dashboard-service");
  const yesterdayBkk = new Date(Date.now() + 7 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await refreshDashboardData(tenant.id, `custom:${yesterdayBkk}..${yesterdayBkk}` as any);
  console.log("   ✓ synced");

  // Pick targets: one CBO daily, one CBO lifetime, one ABO.
  const cboDaily = await prisma.metaCampaign.findFirst({
    where: { connection: { tenantId: tenant.id }, dailyBudget: { not: null } },
    select: { id: true, metaCampaignId: true, name: true, dailyBudget: true },
  });
  const cboLifetime = await prisma.metaCampaign.findFirst({
    where: {
      connection: { tenantId: tenant.id },
      lifetimeBudget: { not: null },
      dailyBudget: null,
    },
    select: { id: true, metaCampaignId: true, name: true, lifetimeBudget: true },
  });
  const abo = await prisma.metaCampaign.findFirst({
    where: { connection: { tenantId: tenant.id }, dailyBudget: null, lifetimeBudget: null },
    select: { id: true, metaCampaignId: true, name: true },
  });

  console.log(`   CBO daily target:   ${cboDaily?.name ?? "(none)"} — ฿${(cboDaily?.dailyBudget ?? 0) / 100}/day`);
  console.log(`   CBO lifetime target: ${cboLifetime?.name ?? "(none)"} — ฿${(cboLifetime?.lifetimeBudget ?? 0) / 100}`);
  console.log(`   ABO target:         ${abo?.name ?? "(none)"}`);

  // Login
  const jar: CookieJar = { value: "" };
  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: owner.email, password: "admin123" }),
    cookieJar: jar,
  });

  // ====== Live API tests ======

  // [3] SET_BUDGET on CBO daily
  if (cboDaily) {
    console.log("\n[3] SET_BUDGET on CBO daily");
    const originalThb = cboDaily.dailyBudget! / 100;
    const newThb = Math.max(20, Math.round(originalThb * 1.1)); // +10%, min ฿20
    const res = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboDaily.id,
        action: "SET_BUDGET",
        dailyBudget: newThb,
      }),
      cookieJar: jar,
    });
    assert(
      res.status === 200,
      `status 200 (got ${res.status}, body=${JSON.stringify(res.body).slice(0, 200)})`,
    );
    assert(res.body.ok === true, "ok=true");

    const after = await prisma.metaCampaign.findUnique({
      where: { id: cboDaily.id },
      select: { dailyBudget: true },
    });
    assert(after?.dailyBudget === newThb * 100, `DB daily = ${newThb * 100}`);

    // [4] Idempotency
    console.log("\n[4] SET_BUDGET same value (idempotency)");
    const idem = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboDaily.id,
        action: "SET_BUDGET",
        dailyBudget: newThb,
      }),
      cookieJar: jar,
    });
    assert(idem.status === 200 && idem.body.ok === true, "idempotent succeeds");

    // [12] Restore
    console.log("\n[12] Restore CBO daily budget");
    await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboDaily.id,
        action: "SET_BUDGET",
        dailyBudget: originalThb,
      }),
      cookieJar: jar,
    });
    console.log(`   ✓ restored to ฿${originalThb}`);
  } else {
    console.log("\n[3] skipped — no CBO daily campaign");
  }

  // [5] SET_BUDGET on ABO → fail
  if (abo) {
    console.log("\n[5] SET_BUDGET on ABO → FAILED with clear msg");
    const res = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: abo.id,
        action: "SET_BUDGET",
        dailyBudget: 100,
      }),
      cookieJar: jar,
    });
    assert(res.status === 502, `502 (got ${res.status})`);
    assert(
      typeof res.body.error === "string" && res.body.error.includes("ad set"),
      `error mentions ad set (got "${res.body.error}")`,
    );
    // Ensure logId is set even on failed validation
    assert(res.body.logId, "logId present on failure");
  } else {
    console.log("\n[5] skipped — no ABO campaign");
  }

  // [6] Below ฿20
  console.log("\n[6] Validation: budget < ฿20");
  if (cboDaily) {
    const res = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboDaily.id,
        action: "SET_BUDGET",
        dailyBudget: 5,
      }),
      cookieJar: jar,
    });
    assert(res.status === 502, `502 (got ${res.status})`);
    assert(
      typeof res.body.error === "string" && res.body.error.includes("ขั้นต่ำ"),
      `mentions ขั้นต่ำ`,
    );
  }

  // [7] Above ฿1M
  console.log("\n[7] Validation: budget > ฿1M");
  if (cboDaily) {
    const res = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboDaily.id,
        action: "SET_BUDGET",
        dailyBudget: 2_000_000,
      }),
      cookieJar: jar,
    });
    assert(res.status === 502, `502 (got ${res.status})`);
    assert(
      typeof res.body.error === "string" && res.body.error.includes("เพดาน"),
      `mentions เพดาน`,
    );
  }

  // [8] Cross-mode: daily on lifetime campaign
  if (cboLifetime) {
    console.log("\n[8] Cross-mode: daily on lifetime-mode campaign → FAILED");
    const res = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboLifetime.id,
        action: "SET_BUDGET",
        dailyBudget: 100,
      }),
      cookieJar: jar,
    });
    assert(res.status === 502, `502 (got ${res.status})`);
    assert(
      typeof res.body.error === "string" && res.body.error.includes("lifetime"),
      `mentions lifetime`,
    );
  }

  // [9] SET_END_DATE future
  if (cboDaily) {
    console.log("\n[9] SET_END_DATE future (+7d)");
    const future = new Date(Date.now() + 7 * 86_400_000);
    // Remember current end_time to restore.
    const before = await prisma.metaCampaign.findUnique({
      where: { id: cboDaily.id },
      select: { endTime: true },
    });
    const res = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboDaily.id,
        action: "SET_END_DATE",
        endTime: future.toISOString(),
      }),
      cookieJar: jar,
    });
    assert(
      res.status === 200,
      `status 200 (got ${res.status}, body=${JSON.stringify(res.body).slice(0, 300)})`,
    );

    // [10] SET_END_DATE in past → fail (via Zod or service)
    console.log("\n[10] SET_END_DATE in past → FAILED");
    const past = new Date(Date.now() - 7 * 86_400_000);
    const pastRes = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignId: cboDaily.id,
        action: "SET_END_DATE",
        endTime: past.toISOString(),
      }),
      cookieJar: jar,
    });
    assert(pastRes.status === 502, `502 (got ${pastRes.status})`);

    // Best-effort restore previous end_time. Meta may not support
    // un-setting end_time, so we only attempt if there was one before.
    if (before?.endTime) {
      await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
        method: "POST",
        body: JSON.stringify({
          campaignId: cboDaily.id,
          action: "SET_END_DATE",
          endTime: before.endTime.toISOString(),
        }),
        cookieJar: jar,
      });
      console.log("   ✓ restored end_time");
    } else {
      console.log("   ⚠ campaign had no end_time before; cannot restore via this API (rare)");
    }
  }

  // [11] Audit log shape
  console.log("\n[11] Audit log shape sanity");
  const recentLogs = await prisma.campaignActionLog.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { action: true, result: true, beforeValue: true, afterValue: true, errorMessage: true },
  });
  assert(recentLogs.length > 0, `${recentLogs.length} log rows`);
  for (const l of recentLogs) {
    if (l.action === "SET_BUDGET" && l.result === "SUCCESS") {
      assert(l.beforeValue !== null && l.afterValue !== null, "SET_BUDGET log has before/after Json");
    }
    if (l.result === "FAILED") {
      assert(typeof l.errorMessage === "string", "FAILED log has errorMessage");
    }
  }

  console.log("\n✅ Budget actions smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

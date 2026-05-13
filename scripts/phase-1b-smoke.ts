// Phase 1b smoke test — campaign goals API + UI auth flow.
//
// Verifies:
//   1. /api/goals GET returns the synced campaigns with resolved goals
//   2. /api/goals POST sets a USER_MANUAL override
//   3. GET reflects the override
//   4. /api/goals DELETE clears the override
//   5. GET shows the campaign back to AUTO_META
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-1b-smoke.ts
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
  console.log("\n🧪 Phase 1b smoke test — Goals API\n");

  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  // Find the tenant + an OWNER user we can sign in as
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
  if (!tenant || !tenant.members[0]) {
    console.log("❌ No tenant with active Meta connection + OWNER member. Connect Meta first.");
    process.exit(1);
  }
  const ownerEmail = tenant.members[0].user.email;
  console.log(`Tenant: ${tenant.slug}  Owner: ${ownerEmail}\n`);

  // We'd need the password to sign in. Try the seed default first.
  console.log("[1] Logging in with seed credentials...");
  const jar: CookieJar = { value: "" };
  let login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ownerEmail, password: "admin123" }),
    cookieJar: jar,
  });
  if (login.status !== 200) {
    console.log(
      `   Login attempt failed (${login.status}). Trying alternate seed password "password123"...`,
    );
    login = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: ownerEmail, password: "password123" }),
      cookieJar: jar,
    });
  }
  assert(login.status === 200, `login OK (status=${login.status})`);

  // 2. GET /api/goals
  console.log("\n[2] GET /api/goals");
  const list = await api(`/api/goals?tenantSlug=${tenant.slug}`, { cookieJar: jar });
  assert(list.status === 200, `list status 200 (got ${list.status})`);
  assert(Array.isArray(list.body.campaigns), "body.campaigns is array");
  assert(list.body.campaigns.length > 0, `has campaigns (${list.body.campaigns.length})`);

  // Pick a campaign whose current goal source is AUTO_META so we can flip it.
  const target = list.body.campaigns.find((c: any) => c.goal.source === "AUTO_META");
  if (!target) {
    console.log("   ⚠ no AUTO_META campaign to test override — skipping write path");
    process.exit(0);
  }
  const originalObjective = target.goal.objective;
  // Pick a *different* objective so we can detect the change
  const flipTo = originalObjective === "SALES" ? "AWARENESS" : "SALES";
  console.log(
    `   Picking campaign "${target.name}" — orig=${originalObjective} → override to ${flipTo}`,
  );

  // 3. POST override
  console.log("\n[3] POST /api/goals (single override)");
  const post = await api(`/api/goals?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({ campaignId: target.id, objective: flipTo }),
    cookieJar: jar,
  });
  assert(post.status === 200, `POST status 200 (got ${post.status})`);
  assert(post.body.goal?.source === "USER_MANUAL", "goal.source=USER_MANUAL");
  assert(post.body.goal?.objective === flipTo, `goal.objective=${flipTo}`);

  // 4. GET again — should reflect the change
  console.log("\n[4] GET /api/goals (should show override)");
  const list2 = await api(`/api/goals?tenantSlug=${tenant.slug}`, { cookieJar: jar });
  const updated = list2.body.campaigns.find((c: any) => c.id === target.id);
  assert(updated, "found updated campaign in list");
  assert(updated.goal.objective === flipTo, `objective is ${flipTo}`);
  assert(updated.goal.source === "USER_MANUAL", "source is USER_MANUAL");

  // 5. DELETE override
  console.log("\n[5] DELETE /api/goals (clear override)");
  const del = await api(
    `/api/goals?tenantSlug=${tenant.slug}&campaignId=${target.id}`,
    { method: "DELETE", cookieJar: jar },
  );
  assert(del.status === 200, `DELETE status 200 (got ${del.status})`);

  // 6. GET — should revert to AUTO_META
  console.log("\n[6] GET /api/goals (should revert to AUTO_META)");
  const list3 = await api(`/api/goals?tenantSlug=${tenant.slug}`, { cookieJar: jar });
  const reverted = list3.body.campaigns.find((c: any) => c.id === target.id);
  assert(reverted, "found reverted campaign in list");
  assert(reverted.goal.source === "AUTO_META", `source back to AUTO_META (got ${reverted.goal.source})`);
  assert(
    reverted.goal.objective === originalObjective,
    `objective back to ${originalObjective}`,
  );

  // 7. Bulk path: pick 3 campaigns and bulk-set them
  console.log("\n[7] POST bulk (3 campaigns at once)");
  const bulkTargets = list3.body.campaigns
    .filter((c: any) => c.goal.source === "AUTO_META")
    .slice(0, 3);
  if (bulkTargets.length === 3) {
    const bulk = await api(`/api/goals?tenantSlug=${tenant.slug}`, {
      method: "POST",
      body: JSON.stringify({
        campaignIds: bulkTargets.map((c: any) => c.id),
        objective: "TRAFFIC",
      }),
      cookieJar: jar,
    });
    assert(bulk.status === 200, `bulk status 200 (got ${bulk.status})`);
    assert(bulk.body.updated === 3, `updated count = 3 (got ${bulk.body.updated})`);

    // Cleanup: clear the 3 overrides
    for (const c of bulkTargets) {
      await api(`/api/goals?tenantSlug=${tenant.slug}&campaignId=${c.id}`, {
        method: "DELETE",
        cookieJar: jar,
      });
    }
    console.log("   ✓ cleaned up bulk overrides");
  } else {
    console.log("   ⚠ not enough AUTO_META campaigns to test bulk — skipped");
  }

  console.log("\n✅ Phase 1b smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Smoke test failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

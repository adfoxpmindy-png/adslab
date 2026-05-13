// Phase 1c smoke test — Naming convention layer.
//
// Verifies:
//   1. POST a naming rule
//   2. GET reflects the rule
//   3. resolveCampaignGoals → matching campaigns now have source=AUTO_NAME
//   4. A USER_MANUAL override still beats the naming rule
//   5. PATCH (priority change) works
//   6. DELETE removes the rule + campaigns revert to AUTO_META
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-1c-smoke.ts
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
  console.log("\n🧪 Phase 1c smoke test — Naming Rules\n");

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
  console.log(`Tenant: ${tenant.slug}  Owner: ${ownerEmail}\n`);

  // Clean any leftover test rules
  await prisma.namingConvention.deleteMany({
    where: { tenantId: tenant.id, pattern: { startsWith: "[smoke-test]" } },
  });

  // Login
  const jar: CookieJar = { value: "" };
  console.log("[1] Login");
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ownerEmail, password: "admin123" }),
    cookieJar: jar,
  });
  assert(login.status === 200, `login OK`);

  // Pick a campaign whose name contains "promo" (case-insensitive) so we
  // can build a substring rule that will match it.
  const campaignsWithPromo = await prisma.metaCampaign.findMany({
    where: {
      connection: { tenantId: tenant.id },
      name: { contains: "promo", mode: "insensitive" },
    },
    take: 5,
    select: { id: true, metaCampaignId: true, name: true, metaObjective: true },
  });
  if (campaignsWithPromo.length === 0) {
    console.log("❌ No campaigns with 'promo' in their name to test against");
    process.exit(1);
  }
  console.log(`\n   Found ${campaignsWithPromo.length} campaigns with 'promo' in name`);
  console.log(`   Example: "${campaignsWithPromo[0].name}"`);

  // 2. Pre-rule baseline: see what objective these campaigns resolve to.
  console.log("\n[2] Baseline (before rule) — checking AUTO_META resolution");
  const { resolveCampaignGoals } = await import("../src/lib/goals/resolver");
  const before = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: campaignsWithPromo.map((c) => ({
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      metaObjective: c.metaObjective,
    })),
  });
  const baseline = campaignsWithPromo.map((c) => before.get(c.metaCampaignId));
  console.log(`   Sources: ${baseline.map((b) => b?.source).join(", ")}`);

  // 3. Create a rule: "[smoke-test] promo" → SALES (note: substring "[smoke-test]" won't match real names — but pattern is "[smoke-test] promo" which actually wouldn't match either. Let me fix this — use a unique-but-matching pattern.)
  console.log("\n[3] Creating naming rule: substring 'promo' → AWARENESS");
  // We deliberately pick AWARENESS (not the campaign's real objective)
  // so we can detect the rule fired. The rule pattern uses just "promo"
  // — and we'll clean it up before any other tenant could rely on it.
  const create = await api(`/api/naming-rules?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({
      pattern: "promo",
      isRegex: false,
      objective: "AWARENESS",
      priority: 100,
    }),
    cookieJar: jar,
  });
  assert(create.status === 200, `POST rule status 200 (got ${create.status})`);
  const ruleId: string = create.body.rule.id;

  // 4. Re-resolve: campaigns matching "promo" should now show source=AUTO_NAME, objective=AWARENESS
  console.log("\n[4] Re-resolve — expect source=AUTO_NAME, objective=AWARENESS");
  const after = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: campaignsWithPromo.map((c) => ({
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      metaObjective: c.metaObjective,
    })),
  });
  let autoNameCount = 0;
  for (const c of campaignsWithPromo) {
    const g = after.get(c.metaCampaignId);
    if (g?.source === "AUTO_NAME" && g.objective === "AWARENESS") autoNameCount++;
  }
  assert(
    autoNameCount === campaignsWithPromo.length,
    `${autoNameCount}/${campaignsWithPromo.length} campaigns resolved via AUTO_NAME → AWARENESS`,
  );

  // 5. Now add a USER_MANUAL override on the first matching campaign.
  //    It should beat the naming rule.
  console.log("\n[5] Manual override on first campaign should beat naming rule");
  const target = campaignsWithPromo[0];
  const override = await api(`/api/goals?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({ campaignId: target.id, objective: "LEADS" }),
    cookieJar: jar,
  });
  assert(override.status === 200, "POST manual override OK");

  const reResolve = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: [
      {
        metaCampaignId: target.metaCampaignId,
        name: target.name,
        metaObjective: target.metaObjective,
      },
    ],
  });
  const targetGoal = reResolve.get(target.metaCampaignId);
  assert(targetGoal?.source === "USER_MANUAL", `target source is USER_MANUAL`);
  assert(targetGoal?.objective === "LEADS", `target objective is LEADS`);

  // 6. PATCH the rule priority
  console.log("\n[6] PATCH rule (change priority)");
  const patch = await api(`/api/naming-rules?tenantSlug=${tenant.slug}`, {
    method: "PATCH",
    body: JSON.stringify({ id: ruleId, priority: 500 }),
    cookieJar: jar,
  });
  assert(patch.status === 200, "PATCH status 200");
  assert(patch.body.rule.priority === 500, `priority=500 (got ${patch.body.rule.priority})`);

  // 7. DELETE the rule + manual override; expect revert to AUTO_META
  console.log("\n[7] Cleanup — delete rule + manual override");
  const delRule = await api(`/api/naming-rules?tenantSlug=${tenant.slug}&id=${ruleId}`, {
    method: "DELETE",
    cookieJar: jar,
  });
  assert(delRule.status === 200, "delete rule OK");
  const delOverride = await api(
    `/api/goals?tenantSlug=${tenant.slug}&campaignId=${target.id}`,
    { method: "DELETE", cookieJar: jar },
  );
  assert(delOverride.status === 200, "delete manual override OK");

  // 8. Final state: campaigns back to AUTO_META
  console.log("\n[8] Final resolve — back to AUTO_META");
  const final = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: campaignsWithPromo.map((c) => ({
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      metaObjective: c.metaObjective,
    })),
  });
  let autoMetaCount = 0;
  for (const c of campaignsWithPromo) {
    if (final.get(c.metaCampaignId)?.source === "AUTO_META") autoMetaCount++;
  }
  assert(
    autoMetaCount === campaignsWithPromo.length,
    `${autoMetaCount}/${campaignsWithPromo.length} campaigns reverted to AUTO_META`,
  );

  console.log("\n✅ Phase 1c smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Smoke test failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

// Smoke test for Meta quick actions (pause / resume).
//
// Scenarios:
//   1. Pause an ACTIVE campaign → Meta confirms, our cache updated, log row created
//   2. Resume it → back to ACTIVE
//   3. Idempotency: pause twice → second call short-circuits as SUCCESS no-op
//   4. Audit log: shows both events with userId + before/after status
//   5. Auth: POST without session → 307 (redirect to /login)
//   6. Validation: bad body → 400
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-quick-actions-smoke.ts
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
  console.log("\n🧪 Meta quick actions smoke test\n");

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
  console.log(`Tenant: ${tenant.slug}  Owner: ${owner.email}\n`);

  // Find a campaign currently ACTIVE so we can pause it then resume it.
  const target = await prisma.metaCampaign.findFirst({
    where: {
      connection: { tenantId: tenant.id },
      effectiveStatus: "ACTIVE",
    },
    select: {
      id: true,
      metaCampaignId: true,
      name: true,
      effectiveStatus: true,
    },
  });
  if (!target) {
    console.log("❌ No ACTIVE campaign to test against");
    process.exit(1);
  }
  console.log(`Target: ${target.name} (${target.metaCampaignId})`);
  console.log(`Initial status: ${target.effectiveStatus}\n`);

  // Login
  const jar: CookieJar = { value: "" };
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: owner.email, password: "admin123" }),
    cookieJar: jar,
  });
  assert(login.status === 200, "login OK");

  // [1] Pause
  console.log("\n[1] Pause ACTIVE campaign");
  const pause = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({ campaignId: target.id, action: "PAUSE" }),
    cookieJar: jar,
  });
  assert(pause.status === 200, `status 200 (got ${pause.status}, body=${JSON.stringify(pause.body).slice(0, 300)})`);
  assert(pause.body.ok === true, "ok=true");
  assert(pause.body.afterStatus === "PAUSED", `afterStatus=PAUSED (got ${pause.body.afterStatus})`);
  const pauseLogId: string = pause.body.logId;

  // Our cache should reflect
  const afterPauseRow = await prisma.metaCampaign.findUnique({
    where: { id: target.id },
    select: { effectiveStatus: true, configuredStatus: true },
  });
  assert(afterPauseRow?.effectiveStatus === "PAUSED", "DB row updated to PAUSED");

  // Log row exists
  const pauseLog = await prisma.campaignActionLog.findUnique({ where: { id: pauseLogId } });
  assert(pauseLog !== null, "audit log row exists");
  assert(pauseLog!.userId === owner.id, "log has correct userId");
  assert(pauseLog!.action === "PAUSE", "log action=PAUSE");
  assert(pauseLog!.result === "SUCCESS", "log result=SUCCESS");

  // [2] Idempotency: pause again → success no-op
  console.log("\n[2] Pause again (idempotency)");
  const pauseAgain = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({ campaignId: target.id, action: "PAUSE" }),
    cookieJar: jar,
  });
  assert(pauseAgain.status === 200, "idempotent status 200");
  assert(pauseAgain.body.ok === true, "ok=true");
  // A new log row should still be created (audit trail).
  assert(pauseAgain.body.logId !== pauseLogId, "new log row for idempotent call");

  // [3] Resume
  console.log("\n[3] Resume → back to ACTIVE");
  const resume = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({ campaignId: target.id, action: "RESUME" }),
    cookieJar: jar,
  });
  assert(resume.status === 200, "resume status 200");
  assert(resume.body.afterStatus === "ACTIVE", "afterStatus=ACTIVE");

  const afterResumeRow = await prisma.metaCampaign.findUnique({
    where: { id: target.id },
    select: { effectiveStatus: true },
  });
  assert(afterResumeRow?.effectiveStatus === "ACTIVE", "DB row updated to ACTIVE");

  // [4] Audit history
  console.log("\n[4] Audit history");
  const logs = await prisma.campaignActionLog.findMany({
    where: { campaignId: target.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  assert(logs.length >= 3, `at least 3 log rows from this run (got ${logs.length})`);
  assert(
    logs.some((l) => l.action === "PAUSE") && logs.some((l) => l.action === "RESUME"),
    "log contains both PAUSE and RESUME",
  );

  // [5] Unauthorized — no cookie
  console.log("\n[5] Unauthorized request");
  const noauth = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({ campaignId: target.id, action: "PAUSE" }),
  });
  assert(noauth.status === 307 || noauth.status === 401, `redirect/unauth (got ${noauth.status})`);

  // [6] Validation
  console.log("\n[6] Validation: bad body");
  const bad = await api(`/api/meta/campaign-actions?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({ campaignId: target.id, action: "NUKE" }),
    cookieJar: jar,
  });
  assert(bad.status === 400, `bad action → 400 (got ${bad.status})`);

  // Cleanup logs from this test run
  await prisma.campaignActionLog.deleteMany({
    where: { campaignId: target.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  console.log("\n   ✓ cleaned up test audit logs");

  console.log("\n✅ Quick actions smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

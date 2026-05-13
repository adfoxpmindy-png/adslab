// End-to-end dogfood test: verify the SDK is installed on prod AdsLab,
// then simulate browser visits to trigger event rules, then check
// EventLog rows in the DB.
//
// Scenarios:
//   1. /sdk.js loads from prod
//   2. Root HTML contains the SDK bootstrap snippet
//   3. SDK config endpoint returns AdsLab rules
//   4. Simulate a Browser fire via direct CAPI POST → verify EventLog row
//      (we can't easily run a headless browser here, so this proves the
//       CAPI path works end-to-end against real Meta with the real
//       AdsLab pixel)
//   5. List recent EventLog rows for the AdsLab pixel
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-5-e2e-dogfood.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { generateSiteKey } from "../src/lib/event-sdk/site-key";

const PROD = process.env.SMOKE_BASE_URL ?? "https://adslab-theta.vercel.app";

type Result = { name: string; pass: boolean; detail?: string };
const out: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  out.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🐶 AdsLab dogfood E2E test\n");
  console.log(`Target: ${PROD}\n`);

  // Look up tenant + pixel
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");
  const someRule = await prisma.eventRule.findFirst({
    where: { tenantId: tenant.id },
    select: { pixelId: true },
  });
  if (!someRule) throw new Error("No EventRule — run dogfood-setup first");
  const pixelId = someRule.pixelId;
  const siteKey = generateSiteKey(tenant.id, pixelId);
  console.log(`Tenant: ${tenant.slug}, pixel: ${pixelId}\n`);

  // 1. /sdk.js loads
  console.log("[1] /sdk.js");
  const sdkRes = await fetch(`${PROD}/sdk.js`);
  const sdkText = await sdkRes.text();
  record(
    "1. /sdk.js serves valid SDK",
    sdkRes.status === 200 && sdkText.includes("fbq") && sdkText.length > 8000,
    `${sdkRes.status}, ${sdkText.length}B`,
  );

  // 2. Root HTML has SDK bootstrap
  console.log("\n[2] Root HTML bootstrap");
  const rootRes = await fetch(`${PROD}/`);
  const rootHtml = await rootRes.text();
  const hasBootstrap =
    rootHtml.includes("adslab-sdk-bootstrap") || rootHtml.includes("_adslab");
  const hasSiteKey = rootHtml.includes(siteKey);
  record(
    "2a. root HTML contains SDK bootstrap",
    hasBootstrap,
    hasBootstrap ? "found" : "missing",
  );
  record("2b. bootstrap uses the live siteKey", hasSiteKey);

  // 3. Config endpoint returns rules for AdsLab pixel
  console.log("\n[3] Config endpoint");
  const cfgRes = await fetch(`${PROD}/api/event-sdk/config/${siteKey}`);
  const cfg = await cfgRes.json();
  record(
    "3a. config endpoint 200",
    cfgRes.status === 200 && cfg.pixelId === pixelId,
    `rules=${cfg.rules?.length}`,
  );
  record(
    "3b. config has multiple rules (seeded)",
    Array.isArray(cfg.rules) && cfg.rules.length >= 5,
    `${cfg.rules?.length} rules`,
  );

  // 4. Simulate fires via direct CAPI POST. We pretend to be the SDK
  // firing PageView on key AdsLab routes.
  console.log("\n[4] Simulate fires (CAPI direct)");
  const routes = [
    { url: `${PROD}/`, event: "PageView" },
    { url: `${PROD}/login`, event: "PageView" },
    { url: `${PROD}/signup`, event: "PageView" },
    { url: `${PROD}/t/${tenant.slug}/dashboard`, event: "ViewContent" },
    { url: `${PROD}/t/${tenant.slug}/campaigns/new`, event: "StartTrial" },
    { url: `${PROD}/verify-email`, event: "CompleteRegistration" },
    { url: `${PROD}/data-deletion`, event: "Contact" },
  ];
  const beforeCount = await prisma.eventLog.count({
    where: { tenantId: tenant.id },
  });
  const firedKeys: string[] = [];
  for (const r of routes) {
    const dedupKey = `dogfood-${r.event}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    firedKeys.push(dedupKey);
    const res = await fetch(`${PROD}/api/event-sdk/capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey,
        eventName: r.event,
        eventId: dedupKey,
        params: {},
        sourceUrl: r.url,
        userAgent: "AdsLab-dogfood-script",
        fbp: null,
        fbc: null,
      }),
    });
    record(`    ${r.event} fire → 204`, res.status === 204, `${r.url.replace(PROD, "")}`);
  }

  // 5. Verify EventLog rows
  console.log("\n[5] Verify EventLog");
  // Small wait to let CAPI relay finish writing
  await new Promise((r) => setTimeout(r, 1500));
  const afterCount = await prisma.eventLog.count({
    where: { tenantId: tenant.id },
  });
  record(
    "5a. EventLog row count increased",
    afterCount >= beforeCount + routes.length,
    `before=${beforeCount} after=${afterCount}`,
  );

  const rows = await prisma.eventLog.findMany({
    where: { tenantId: tenant.id, dedupKey: { in: firedKeys } },
    orderBy: { firedAt: "desc" },
  });
  record(
    "5b. all fires found by dedupKey",
    rows.length === routes.length,
    `found ${rows.length}/${routes.length}`,
  );

  const successes = rows.filter((r) => r.capiStatus === "success").length;
  const failures = rows.filter((r) => r.capiStatus === "failed").length;
  console.log(`\n   CAPI status breakdown:`);
  console.log(`     success: ${successes}`);
  console.log(`     failed:  ${failures}`);
  if (failures > 0) {
    const sample = rows.find((r) => r.capiStatus === "failed");
    if (sample?.capiResponse) {
      console.log(`     first failure: ${JSON.stringify(sample.capiResponse).slice(0, 300)}`);
    }
  }

  // 6. Cleanup: delete our test fires so they don't pollute the real log
  await prisma.eventLog.deleteMany({
    where: { tenantId: tenant.id, dedupKey: { in: firedKeys } },
  });
  console.log(`\n   ✓ Cleaned up ${firedKeys.length} test fires from EventLog`);

  console.log("\n=== Summary ===");
  const pass = out.filter((r) => r.pass).length;
  console.log(`${pass}/${out.length} scenarios passed`);
  if (pass < out.length) {
    console.log("Failed:");
    for (const r of out.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

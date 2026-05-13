// Phase 5 smoke test — Event Tracking SDK foundation.
//
// What we verify (scenarios):
//   A. siteKey round-trip: generate → verify → tenant+pixel match
//   B. siteKey tamper: flip a byte → verify returns null
//   C. siteKey malformed: missing dot → null; wrong base32 → null
//   D. Public config endpoint: invalid siteKey → 404
//   E. Public config endpoint: valid siteKey, no rules → 200 with empty rules
//   F. Public config endpoint: valid siteKey, with rule → returns rule
//   G. CAPI endpoint: invalid siteKey → 404
//   H. CAPI endpoint: valid siteKey + happy path → 204 + EventLog persisted
//   I. CAPI endpoint: missing eventId → 400
//   J. SDK static file: GET /sdk.js → 200 with JS content
//   K. EventRule create + toggle + delete (DB only, skip auth wrapping)
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-5-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { generateSiteKey, verifySiteKey } from "../src/lib/event-sdk/site-key";

const PROD_URL = process.env.SMOKE_BASE_URL ?? "https://adslab-theta.vercel.app";

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];

function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🧪 Phase 5 smoke test — Event Tracking SDK\n");
  console.log(`Target: ${PROD_URL}\n`);

  // ---- Scenario A-C: siteKey unit tests --------------------------
  console.log("[A-C] siteKey unit tests");
  const tenantId = "cmtest123abc";
  const pixelId = "9876543210";
  const sk = generateSiteKey(tenantId, pixelId);
  const decoded = verifySiteKey(sk);
  record(
    "A. roundtrip",
    decoded?.tenantId === tenantId && decoded?.pixelId === pixelId,
    `key=${sk.slice(0, 18)}...`,
  );

  // Tamper: flip a char in the tag portion
  const parts = sk.split(".");
  const flipped = `${parts[0]}.${parts[1].slice(0, -1)}${parts[1].slice(-1) === "A" ? "B" : "A"}`;
  record("B. tampered tag rejected", verifySiteKey(flipped) === null);

  record("C1. no-dot rejected", verifySiteKey("nokeythatworks") === null);
  record("C2. empty rejected", verifySiteKey("") === null);
  record("C3. malformed base32 rejected", verifySiteKey("???.???") === null);

  // ---- Scenario D: invalid siteKey → 404 ------------------------
  console.log("\n[D] Public config endpoint — invalid siteKey");
  try {
    const r = await fetch(`${PROD_URL}/api/event-sdk/config/badkey`);
    record("D. invalid siteKey returns 404", r.status === 404, `status=${r.status}`);
  } catch (e) {
    record("D. invalid siteKey returns 404", false, String(e));
  }

  // ---- Scenario J: SDK file --------------------------------------
  console.log("\n[J] SDK static file");
  try {
    const r = await fetch(`${PROD_URL}/sdk.js`);
    const text = await r.text();
    const hasInit = text.includes("fetchConfig") && text.includes("fbq");
    record(
      "J. /sdk.js loads + has SDK code",
      r.status === 200 && hasInit,
      `${r.status}, ${text.length} bytes`,
    );
  } catch (e) {
    record("J. /sdk.js loads", false, String(e));
  }

  // ---- Use a real tenant for E, F, H ----------------------------
  console.log("\n[Setup] Looking for a tenant + pixel for end-to-end tests");
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    console.log("⚠ Skipping E/F/H/K — no tenant with active Meta connection");
    return summarize(prisma);
  }
  console.log(`Using tenant: ${tenant.name} (${tenant.slug}, ${tenant.id})\n`);

  // For E/F/H we need a pixel ID. We don't have a strict requirement that
  // it exists in Meta — the config endpoint doesn't call Meta. Use any
  // numeric string. For H (CAPI), Meta will reject if pixel invalid, but
  // the EventLog row still gets persisted with capiStatus=failed.
  const testPixelId = "1234567890123456"; // fake; CAPI will fail on send
  const siteKey = generateSiteKey(tenant.id, testPixelId);

  // ---- E: config valid siteKey, no rules ------------------------
  console.log("[E] Public config endpoint — valid siteKey, no rules");
  try {
    const r = await fetch(`${PROD_URL}/api/event-sdk/config/${siteKey}`);
    const data = await r.json();
    record(
      "E. valid siteKey, empty rules",
      r.status === 200 && data.pixelId === testPixelId && Array.isArray(data.rules),
      `pixelId=${data.pixelId}, rules=${data.rules?.length}`,
    );
  } catch (e) {
    record("E. valid siteKey, empty rules", false, String(e));
  }

  // ---- K + F: Create rule → verify config returns it -----------
  console.log("\n[K, F] Create rule → verify config returns it");
  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { userId: true },
  });
  if (!owner) {
    record("K. create rule (needs OWNER)", false, "no OWNER in tenant");
  } else {
    const rule = await prisma.eventRule.create({
      data: {
        tenantId: tenant.id,
        createdByUserId: owner.userId,
        name: "Smoke test - URL match thank-you",
        pixelId: testPixelId,
        triggerType: "url",
        conditions: { op: "contains", value: "/thank-you", fireOnce: true } as never,
        eventName: "Purchase",
        enabled: true,
      },
    });
    record("K1. rule created in DB", !!rule.id, `id=${rule.id}`);

    // F: config should now include this rule (cache-bust by using fresh URL)
    try {
      const r = await fetch(
        `${PROD_URL}/api/event-sdk/config/${siteKey}?bust=${Date.now()}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      const found = (data.rules ?? []).find((x: { id: string }) => x.id === rule.id);
      record(
        "F. valid siteKey returns created rule",
        r.status === 200 && !!found,
        `rules=${data.rules?.length}, found=${!!found}`,
      );
    } catch (e) {
      record("F. valid siteKey returns created rule", false, String(e));
    }

    // K2: toggle disabled
    await prisma.eventRule.update({
      where: { id: rule.id },
      data: { enabled: false },
    });
    const refetched = await prisma.eventRule.findUnique({ where: { id: rule.id } });
    record("K2. rule toggle disabled persists", refetched?.enabled === false);

    // K3: delete
    await prisma.eventRule.delete({ where: { id: rule.id } });
    const deleted = await prisma.eventRule.findUnique({ where: { id: rule.id } });
    record("K3. rule deleted", deleted === null);
  }

  // ---- G: CAPI invalid siteKey → 404 ----------------------------
  console.log("\n[G] CAPI endpoint — invalid siteKey");
  try {
    const r = await fetch(`${PROD_URL}/api/event-sdk/capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey: "badkey",
        eventName: "Purchase",
        eventId: "test-1",
      }),
    });
    record("G. CAPI invalid siteKey → 404", r.status === 404, `status=${r.status}`);
  } catch (e) {
    record("G. CAPI invalid siteKey → 404", false, String(e));
  }

  // ---- I: CAPI missing eventId → 400 ----------------------------
  console.log("\n[I] CAPI endpoint — missing eventId");
  try {
    const r = await fetch(`${PROD_URL}/api/event-sdk/capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteKey, eventName: "Purchase" }),
    });
    record("I. missing eventId → 400", r.status === 400, `status=${r.status}`);
  } catch (e) {
    record("I. missing eventId → 400", false, String(e));
  }

  // ---- H: CAPI happy path → 204 + EventLog row ------------------
  console.log("\n[H] CAPI endpoint — happy path (pixel will fail Meta call)");
  const dedupKey = `smoke-${Date.now()}`;
  try {
    const r = await fetch(`${PROD_URL}/api/event-sdk/capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey,
        eventName: "Purchase",
        eventId: dedupKey,
        params: { value: 299, currency: "THB" },
        sourceUrl: "https://example.com/thank-you",
        referrer: "https://example.com/checkout",
        userAgent: "smoke-test",
        fbp: "fb.1.test",
        fbc: null,
      }),
    });
    record("H1. CAPI valid → 204", r.status === 204, `status=${r.status}`);

    // Verify EventLog row persisted
    const log = await prisma.eventLog.findFirst({
      where: { tenantId: tenant.id, dedupKey },
    });
    record(
      "H2. EventLog row created",
      !!log,
      log ? `status=${log.capiStatus}, event=${log.eventName}` : "no row",
    );
    if (log) {
      // Clean up smoke test log
      await prisma.eventLog.delete({ where: { id: log.id } });
    }
  } catch (e) {
    record("H. CAPI happy path", false, String(e));
  }

  await summarize(prisma);
}

async function summarize(prisma: PrismaClient) {
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`${passed}/${total} scenarios passed\n`);
  if (passed < total) {
    console.log("Failed:");
    for (const r of results.filter((r) => !r.pass)) {
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

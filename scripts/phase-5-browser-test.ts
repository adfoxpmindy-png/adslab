// Real-browser E2E test for the Phase 5 SDK.
//
// Approach: drive headless Chromium against prod, then verify by inspecting
// the EventLog table in the DB. We don't try to parse sendBeacon POST
// bodies in Playwright — Blob payloads are unreliable to read. The DB
// is the source of truth: if a row exists with our test marker time range
// and the expected eventName, the SDK fire path worked end-to-end.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-5-browser-test.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium, type Page } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _adslab?: string;
  }
}

const PROD = process.env.SMOKE_BASE_URL ?? "https://adslab-theta.vercel.app";

type Res = { name: string; pass: boolean; detail?: string };
const out: Res[] = [];
function rec(name: string, pass: boolean, detail?: string) {
  out.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🎭 Phase 5 BROWSER test — real Chromium on prod\n");
  console.log(`Target: ${PROD}\n`);

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (PlaywrightBot/1.0) AdsLab-Phase5-Test",
    viewport: { width: 1280, height: 1600 },
  });

  // Track which network requests went to our CAPI endpoint (count only)
  let capiRequestCount = 0;
  let configRequestCount = 0;
  context.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/event-sdk/config/")) configRequestCount++;
    if (u.endsWith("/api/event-sdk/capi") && req.method() === "POST") capiRequestCount++;
  });

  const page = await context.newPage();

  // Mark the start time — we use this to filter EventLog rows. Add a small
  // negative buffer in case clock skew between test and DB.
  const testStart = new Date(Date.now() - 5_000);

  // ====================================================================
  // 1-7: Homepage SDK initialization
  // ====================================================================
  console.log("[1-7] Homepage SDK init");
  await page.goto(`${PROD}/`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => !!window.fbq, { timeout: 5_000 }).catch(() => {});

  rec("1. bootstrap script in HTML", await hasBootstrap(page));
  rec("2. window.fbq injected", await page.evaluate(() => typeof window.fbq === "function"));
  rec(
    "3. window._adslab has siteKey",
    !!(await page.evaluate(() => window._adslab))?.length,
  );
  rec("4. config endpoint requested", configRequestCount >= 1);
  rec(
    "5. Meta Pixel fbevents.js script added",
    await page.evaluate(() => !!document.querySelector('script[src*="fbevents.js"]')),
  );

  // Let any pending CAPI POSTs finish
  await page.waitForTimeout(2000);
  rec("6. CAPI POST happened on homepage load", capiRequestCount >= 1, `${capiRequestCount}`);

  // ====================================================================
  // 8: Navigate to /verify-email — CompleteRegistration rule
  // ====================================================================
  console.log("\n[8] Navigate to /verify-email → CompleteRegistration");
  const beforeNav = capiRequestCount;
  await page.goto(`${PROD}/verify-email`, { waitUntil: "networkidle", timeout: 20_000 });
  await page.waitForTimeout(2500);
  rec(
    "8a. CAPI POST after /verify-email navigation",
    capiRequestCount > beforeNav,
    `${capiRequestCount - beforeNav} new fires`,
  );

  // ====================================================================
  // 9: Scroll trigger
  // ====================================================================
  console.log("\n[9] Scroll trigger");
  await page.goto(`${PROD}/`, { waitUntil: "networkidle", timeout: 20_000 });
  await page.waitForTimeout(1500);
  const beforeScroll = capiRequestCount;
  // Pad page so scrolling is meaningful
  await page.evaluate(() => {
    const pad = document.createElement("div");
    pad.style.height = "5000px";
    document.body.appendChild(pad);
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  rec(
    "9. scroll triggered a CAPI POST",
    capiRequestCount > beforeScroll,
    `${capiRequestCount - beforeScroll} new fires`,
  );

  // ====================================================================
  // 10: cookies
  // ====================================================================
  console.log("\n[10] Meta Pixel cookies");
  const cookies = await context.cookies();
  const fbp = cookies.find((c) => c.name === "_fbp");
  rec("10. _fbp cookie set", !!fbp, fbp ? `domain=${fbp.domain}` : "(missing)");

  // ====================================================================
  // 11: Verify DB EventLog — at least N rows in our time window
  // ====================================================================
  console.log("\n[11] Verify EventLog persisted");
  // Wait a moment for last CAPI POSTs to complete writes
  await page.waitForTimeout(3000);
  const rows = await prisma.eventLog.findMany({
    where: {
      tenantId: tenant.id,
      firedAt: { gte: testStart },
      // exclude rows from other clients during the test window by user-agent
      browserContext: {
        path: ["userAgent"],
        string_contains: "PlaywrightBot",
      },
    },
    orderBy: { firedAt: "asc" },
  });
  rec(
    "11a. EventLog rows from this test exist",
    rows.length > 0,
    `${rows.length} rows`,
  );

  const eventNames = rows.map((r) => r.eventName);
  rec(
    "11b. PageView fired (homepage)",
    eventNames.includes("PageView"),
    eventNames.join(", "),
  );
  rec(
    "11c. CompleteRegistration fired (/verify-email)",
    eventNames.includes("CompleteRegistration"),
  );
  rec(
    "11d. ViewContent fired (scroll trigger or URL match)",
    eventNames.includes("ViewContent"),
  );

  const successCount = rows.filter((r) => r.capiStatus === "success").length;
  rec(
    "11e. all CAPI fires reached Meta with success",
    successCount === rows.length && rows.length > 0,
    `${successCount}/${rows.length}`,
  );

  // Print full event timeline
  console.log("\n   Event timeline:");
  for (const r of rows) {
    console.log(
      `     ${r.firedAt.toISOString()} · ${r.eventName.padEnd(22)} · ${r.capiStatus}`,
    );
  }

  // ====================================================================
  // Cleanup
  // ====================================================================
  console.log("\nCleanup...");
  const cleaned = await prisma.eventLog.deleteMany({
    where: {
      tenantId: tenant.id,
      firedAt: { gte: testStart },
      browserContext: {
        path: ["userAgent"],
        string_contains: "PlaywrightBot",
      },
    },
  });
  console.log(`   removed ${cleaned.count} test rows`);

  await browser.close();
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

async function hasBootstrap(page: Page): Promise<boolean> {
  const html = await page.content();
  return html.includes("_adslab") || html.includes("adslab-sdk-bootstrap");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

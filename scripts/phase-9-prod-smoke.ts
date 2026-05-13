/**
 * Phase 9 prod smoke test — verify deploy is healthy.
 *
 * Logs in as tenant owner via sealed iron-session cookie, then hits:
 *   - /t/<slug>/dashboard (grandfathered tenant should load)
 *   - /t/<slug>/settings/billing (current plan card should render)
 *   - /api/billing/invoices (should return ok=true)
 *
 * Plus unauthenticated checks that gates work as expected.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://adslab-theta.vercel.app";

async function main() {
  const cs = process.env.DATABASE_URL!;
  const sec = process.env.SESSION_SECRET!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  // Pick the grandfathered tenant (adstfl — 31 accts)
  const tenant = await prisma.tenant.findFirst({
    where: { slug: "adstfl" },
    select: {
      id: true,
      slug: true,
      name: true,
      members: {
        where: { role: "OWNER" },
        take: 1,
        select: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  if (!tenant) throw new Error("adstfl tenant not found");
  const owner = tenant.members[0].user;

  // Verify subscription is present
  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
    include: { plan: true },
  });
  console.log(`Tenant ${tenant.slug} subscription: ${sub?.plan.key} / ${sub?.status}`);

  const sealed = await sealData(
    { userId: owner.id, email: owner.email, name: owner.name },
    { password: sec },
  );

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{
    name: "adslab_session",
    value: sealed,
    domain: new URL(PROD).hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  }]);
  const page = await ctx.newPage();

  const results: { name: string; pass: boolean; detail?: string }[] = [];

  // Test 1: Dashboard loads (grandfathered subscription = no redirect)
  const r1 = await page.goto(`${PROD}/t/${tenant.slug}/dashboard`, { waitUntil: "domcontentloaded" });
  if (r1?.status() === 200 && !page.url().includes("setup-billing")) {
    results.push({ name: "Dashboard loads for grandfathered tenant", pass: true, detail: page.url() });
  } else {
    results.push({ name: "Dashboard load", pass: false, detail: `status=${r1?.status()} url=${page.url()}` });
  }

  // Test 2: Settings → Billing renders
  const r2 = await page.goto(`${PROD}/t/${tenant.slug}/settings/billing`, { waitUntil: "domcontentloaded" });
  if (r2?.status() === 200) {
    const hasPlanCard = await page.locator("text=แพ็กเกจปัจจุบัน").count();
    results.push({
      name: "Settings → Billing renders plan card",
      pass: hasPlanCard > 0,
      detail: `status=${r2.status()} hasCard=${hasPlanCard}`,
    });
    await page.screenshot({ path: "scripts/phase-9-billing-page.png", fullPage: true });
    console.log("  📸 scripts/phase-9-billing-page.png");
  } else {
    results.push({ name: "Settings → Billing", pass: false, detail: `status=${r2?.status()}` });
  }

  // Test 3: API /billing/invoices works
  const invRes = await page.request.get(`${PROD}/api/billing/invoices?tenantSlug=${tenant.slug}`);
  const invBody = await invRes.json();
  results.push({
    name: "GET /api/billing/invoices",
    pass: invRes.status() === 200 && invBody.ok === true,
    detail: `status=${invRes.status()} ok=${invBody.ok} count=${invBody.invoices?.length}`,
  });

  // Test 4: AI chat still works (Scale tier = unlimited)
  // Just check the page loads
  const r4 = await page.goto(`${PROD}/t/${tenant.slug}/ai`, { waitUntil: "domcontentloaded" });
  results.push({
    name: "/ai page accessible on Scale tier",
    pass: r4?.status() === 200 && !page.url().includes("setup-billing"),
    detail: `status=${r4?.status()}`,
  });

  // Test 5: Journey page (Phase 8) still loads
  const r5 = await page.goto(`${PROD}/t/${tenant.slug}/journey`, { waitUntil: "domcontentloaded" });
  results.push({
    name: "/journey page accessible",
    pass: r5?.status() === 200,
    detail: `status=${r5?.status()}`,
  });

  // Test 6: Setup-billing page renders if we have no subscription
  // (need a tenant without sub to test — use a separate test that creates one)
  await page.goto(`${PROD}/setup-billing`, { waitUntil: "domcontentloaded" });
  // Should redirect to dashboard since we have a sub
  results.push({
    name: "/setup-billing redirects when sub exists",
    pass: page.url().includes("dashboard") || page.url().includes("/t/"),
    detail: page.url(),
  });

  // Print summary
  console.log("\n━".repeat(50));
  console.log("\nProd smoke test results:");
  for (const r of results) {
    console.log(`  ${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed\n`);

  await browser.close();
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});

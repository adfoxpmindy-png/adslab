// Real-browser Playwright test for Phase 6a (multi-platform UX).
//
// Strategy for auth:
//   We mint an iron-session cookie directly in Node using SESSION_SECRET,
//   then inject it into Playwright's browser context. Skips the login
//   form roundtrip and avoids needing real credentials in CI.
//
// Scenarios:
//   1. PlatformBar visible on dashboard
//   2. Platform tabs: Meta active, Google/Tiktok marked Soon
//   3. Account picker dropdown opens, lists accounts
//   4. Clicking an account checkbox persists the preference
//   5. Coming Soon page (/g) renders with waitlist form
//   6. Waitlist submit POSTs to /api/platform-waitlist → row in DB
//   7. Settings → Integrations shows 3 platform cards (Meta + Google + TikTok)
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-6a-browser-test.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

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

  console.log("\n🎭 Phase 6a BROWSER test — Multi-platform UX\n");
  console.log(`Target: ${PROD}\n`);

  // Find an OWNER user in the demo tenant + mint a session cookie
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");

  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!owner) throw new Error("No OWNER user");

  // Iron-session seal — same options as src/lib/auth/session.ts.
  const sealed = await sealData(
    { userId: owner.user.id, email: owner.user.email, name: owner.user.name },
    { password: sessionSecret },
  );

  // Clear any preference left from prior runs
  await prisma.userAccountPreference.deleteMany({
    where: { userId: owner.user.id, tenantId: tenant.id },
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (PlaywrightBot/1.0) Phase6a-Test",
  });
  // Inject session cookie
  await context.addCookies([
    {
      name: "adslab_session",
      value: sealed,
      domain: new URL(PROD).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  // 1. PlatformBar visible on dashboard
  console.log("[1] Dashboard PlatformBar");
  await page.goto(`${PROD}/t/${tenant.slug}/dashboard`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  rec(
    "1a. PlatformBar buttons (Meta/Google/TikTok) rendered",
    (await page.getByRole("link", { name: /Meta/ }).count()) > 0 &&
      (await page.getByRole("link", { name: /Google/ }).count()) > 0 &&
      (await page.getByRole("link", { name: /TikTok/ }).count()) > 0,
  );
  const accountsButton = page.getByRole("button", { name: /Accounts/ });
  rec(
    "1b. Account picker button visible",
    (await accountsButton.count()) > 0,
  );

  // 2. Google + TikTok have "Soon" badge
  const html = await page.content();
  rec(
    "2. Google + TikTok labeled 'Soon'",
    (html.match(/Soon/gi) ?? []).length >= 2,
  );

  // 3. Account picker dropdown opens
  console.log("\n[3-4] Account picker interaction");
  await accountsButton.click();
  await page.waitForTimeout(500);
  const dropdownVisible = await page
    .locator('input[placeholder*="ค้นหา ad account"]')
    .isVisible();
  rec("3a. Dropdown opens with search input", dropdownVisible);

  const checkboxes = page.locator('button:has(div[class*="border"])');
  const checkboxCount = await checkboxes.count();
  rec(
    "3b. Account checkboxes listed in dropdown",
    checkboxCount >= 1,
    `${checkboxCount} accounts visible`,
  );

  // 4. Click first checkbox (deselect 1 account) → preference saved
  console.log("\n[4] Persist preference");
  await page.getByText("ล้างทั้งหมด").click();
  await page.waitForTimeout(1500);
  const prefRow = await prisma.userAccountPreference.findUnique({
    where: { userId_tenantId: { userId: owner.user.id, tenantId: tenant.id } },
  });
  rec(
    "4a. preference row written after 'ล้างทั้งหมด' click",
    !!prefRow,
    `selectedAccountIds=${JSON.stringify(prefRow?.selectedAccountIds)}`,
  );
  rec(
    "4b. preference is empty array (= ล้างทั้งหมด)",
    Array.isArray(prefRow?.selectedAccountIds) &&
      (prefRow.selectedAccountIds as unknown[]).length === 0,
  );

  // Reset to all so other tests aren't affected
  await prisma.userAccountPreference.deleteMany({
    where: { userId: owner.user.id, tenantId: tenant.id },
  });

  // 5. Coming Soon page for Google
  console.log("\n[5-6] Coming Soon: Google");
  await page.goto(`${PROD}/t/${tenant.slug}/g`, {
    waitUntil: "networkidle",
    timeout: 20_000,
  });
  rec(
    "5a. Google coming-soon heading renders",
    (await page.getByRole("heading", { name: /Google Ads/i }).count()) > 0,
  );

  // 6. Submit waitlist email
  const testEmail = `phase6a-browser-${Date.now()}@example.com`;
  await page.locator('input[type="email"]').fill(testEmail);
  await page.getByRole("button", { name: /ลงทะเบียน/i }).click();
  await page.waitForTimeout(2000);

  const waitlistRow = await prisma.platformWaitlist.findFirst({
    where: { email: testEmail.toLowerCase(), platform: "google" },
  });
  rec("6. waitlist row persisted in DB", !!waitlistRow);

  // Cleanup waitlist
  await prisma.platformWaitlist.deleteMany({
    where: { email: testEmail.toLowerCase() },
  });

  // 7. Settings → Integrations: 3 cards
  console.log("\n[7] Settings → Integrations");
  await page.goto(`${PROD}/t/${tenant.slug}/settings/integrations`, {
    waitUntil: "networkidle",
    timeout: 20_000,
  });
  const settingsHtml = await page.content();
  rec(
    "7a. Meta section visible",
    settingsHtml.includes("Meta Ads") || settingsHtml.includes("Meta"),
  );
  rec("7b. Google Ads section visible", settingsHtml.includes("Google Ads"));
  rec("7c. TikTok Ads section visible", settingsHtml.includes("TikTok Ads"));

  // Take a screenshot for vibe check
  try {
    await page.screenshot({ path: "scripts/phase-6a-screenshot.png", fullPage: true });
    console.log("\n📸 Screenshot: scripts/phase-6a-screenshot.png");
  } catch {}

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

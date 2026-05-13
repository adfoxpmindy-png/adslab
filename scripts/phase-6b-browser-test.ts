// Phase 6b browser test — Tenant Scope UI in Settings + end-to-end.
//
// Scenarios:
//   1. Settings page renders TenantScope section
//   2. Account multi-select interaction (uncheck one → "บันทึก" enabled)
//   3. Save → PUT /api/tenant-scope → TenantScope row in DB matches
//   4. After save, Campaigns page lists only campaigns from selected accounts
//   5. Cleanup: revert TenantScope row
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-6b-browser-test.ts
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

  console.log("\n🎭 Phase 6b BROWSER — Tenant Scope\n");
  console.log(`Target: ${PROD}\n`);

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");
  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!owner) throw new Error("No OWNER");

  // Snapshot existing scope to restore after test
  const existing = await prisma.tenantScope.findUnique({
    where: { tenantId: tenant.id },
    select: { accountIds: true, campaignIds: true },
  });

  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.userAccountPreference.deleteMany({
    where: { userId: owner.user.id, tenantId: tenant.id },
  });

  const sealed = await sealData(
    { userId: owner.user.id, email: owner.user.email, name: owner.user.name },
    { password: sessionSecret },
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (PlaywrightBot/1.0) Phase6b-Test",
    viewport: { width: 1400, height: 1800 },
  });
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

  // 1. Settings page renders Tenant Scope
  console.log("[1] Settings page renders Tenant Scope section");
  await page.goto(`${PROD}/t/${tenant.slug}/settings/integrations`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  rec(
    "1a. 'Tenant Scope' heading present",
    (await page.getByRole("heading", { name: /Tenant Scope/i }).count()) > 0,
  );
  rec(
    "1b. 'Ad Accounts' accordion visible",
    (await page.getByText(/Ad Accounts/).count()) > 0,
  );

  // 2. Click "ล้าง" (clear) on accounts → save button enables
  console.log("\n[2] Interaction: clear all accounts → dirty → save");
  const clearBtn = page
    .getByRole("button", { name: "ล้าง", exact: true })
    .first();
  await clearBtn.click();
  await page.waitForTimeout(300);

  const saveBtn = page.getByRole("button", { name: /บันทึก/ });
  rec("2a. Save button visible after change", (await saveBtn.count()) > 0);

  await saveBtn.click();
  await page.waitForTimeout(2000);

  const row = await prisma.tenantScope.findUnique({
    where: { tenantId: tenant.id },
    select: { accountIds: true, campaignIds: true },
  });
  rec(
    "3. TenantScope row written",
    !!row,
    `accountIds=${JSON.stringify(row?.accountIds)}`,
  );
  rec(
    "3b. accountIds = empty array (= ล้างทั้งหมด)",
    Array.isArray(row?.accountIds) &&
      (row.accountIds as unknown[]).length === 0,
  );

  // 4. Campaigns page should now show 0 campaigns
  console.log("\n[4] Campaigns page reflects empty scope");
  await page.goto(`${PROD}/t/${tenant.slug}/campaigns`, {
    waitUntil: "networkidle",
    timeout: 20_000,
  });
  // After empty scope, the campaigns list should show empty-state text
  const campaignsHtml = await page.content();
  const isEmpty =
    campaignsHtml.includes("ไม่พบ") ||
    campaignsHtml.includes("ยังไม่มี") ||
    !campaignsHtml.includes("ACTIVE");
  rec(
    "4. Campaigns page filtered to empty (no ACTIVE rows)",
    isEmpty,
    isEmpty ? "filtered" : "still showing campaigns",
  );

  // Screenshot
  try {
    await page.screenshot({ path: "scripts/phase-6b-screenshot.png", fullPage: true });
    console.log("\n📸 scripts/phase-6b-screenshot.png");
  } catch {}

  // Cleanup — restore scope to what it was
  console.log("\nRestore scope to original state...");
  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });
  if (existing) {
    await prisma.tenantScope.create({
      data: {
        tenantId: tenant.id,
        accountIds: existing.accountIds as never,
        campaignIds: existing.campaignIds as never,
      },
    });
  }
  await prisma.userAccountPreference.deleteMany({
    where: { userId: owner.user.id, tenantId: tenant.id },
  });

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

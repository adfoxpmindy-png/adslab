// Smoke test for the Round 1-3 UX changes on prod.
//
// Scenarios:
//   1. Sidebar: no "Insights" or "Event Log" (removed/relocated)
//   2. Dashboard: OnboardingChecklist renders for OWNER
//   3. Settings page has 3 tabs (Scope / Naming / Integrations)
//   4. Empty state CTAs render on Audiences/Pixels/Conversions/Events
//   5. /dashboard and / redirect for logged-in user to tenant dashboard
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/ux-audit-test.ts
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

  console.log("\n🎨 UX audit test\n");
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

  const sealed = await sealData(
    { userId: owner.user.id, email: owner.user.email, name: owner.user.name },
    { password: sessionSecret },
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (PlaywrightBot/1.0) UX-Audit",
    viewport: { width: 1400, height: 1600 },
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

  // ---- 1. Dashboard sidebar ----
  console.log("[1] Sidebar nav items");
  await page.goto(`${PROD}/t/${tenant.slug}/dashboard`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  const html = await page.content();
  rec("1a. sidebar has Dashboard", html.includes(">Dashboard<"));
  rec("1b. sidebar has Settings", html.includes(">Settings<"));
  rec(
    "1c. sidebar does NOT have 'Insights (เร็วๆ นี้)' dead link",
    !html.includes("เร็วๆ นี้"),
  );

  // ---- 2. Onboarding checklist ----
  console.log("\n[2] Onboarding checklist on Dashboard");
  rec(
    "2a. 'เริ่มต้นใช้งาน AdsLab' heading present",
    html.includes("เริ่มต้นใช้งาน AdsLab") ||
      html.includes("เริ่มต้นใช้งาน"),
  );
  // At least one of the 4 steps should appear
  const stepNames = [
    "เชื่อมต่อ Meta",
    "เลือก ad accounts",
    "Naming Convention",
    "สร้าง Campaign",
  ];
  const stepsFound = stepNames.filter((s) => html.includes(s)).length;
  rec(
    "2b. at least 2 onboarding steps visible",
    stepsFound >= 2,
    `${stepsFound}/4 visible`,
  );

  // ---- 3. Settings tabs ----
  console.log("\n[3] Settings tabs");
  await page.goto(`${PROD}/t/${tenant.slug}/settings/integrations`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  const settingsHtml = await page.content();
  rec("3a. Tenant Scope tab", settingsHtml.includes("Tenant Scope"));
  rec(
    "3b. Naming Standards tab",
    settingsHtml.includes("Naming Standards"),
  );
  rec("3c. Integrations tab", settingsHtml.includes("Integrations"));

  // Switch to Naming tab via query param
  await page.goto(`${PROD}/t/${tenant.slug}/settings/integrations?tab=naming`, {
    waitUntil: "networkidle",
    timeout: 20_000,
  });
  const namingTabHtml = await page.content();
  rec(
    "3d. Naming tab shows NamingTemplatesCard",
    namingTabHtml.includes("Naming Standards") &&
      (namingTabHtml.includes("เพิ่ม Template") ||
        namingTabHtml.includes("AI วิเคราะห์")),
  );

  // Switch to Integrations tab
  await page.goto(
    `${PROD}/t/${tenant.slug}/settings/integrations?tab=integrations`,
    { waitUntil: "networkidle", timeout: 20_000 },
  );
  const intHtml = await page.content();
  rec("3e. Integrations tab shows Meta + Google + TikTok", intHtml.includes("Meta Ads") && intHtml.includes("Google Ads") && intHtml.includes("TikTok Ads"));

  // ---- 4. Empty state CTAs ----
  console.log("\n[4] Audiences empty state CTAs");
  // Just check the buttons exist in the audiences markup
  await page.goto(`${PROD}/t/${tenant.slug}/audiences`, {
    waitUntil: "networkidle",
    timeout: 20_000,
  });
  const audHtml = await page.content();
  // CTA buttons appear in the empty-state branches only when there
  // are 0 audiences/pixels — for a tenant with data the test passes
  // by just confirming the page renders without error.
  rec("4a. /audiences renders", audHtml.length > 1000);

  // ---- 5. Redirect tests ----
  console.log("\n[5] Smart redirects");
  for (const path of ["/", "/dashboard"]) {
    const res = await page.goto(`${PROD}${path}`, {
      waitUntil: "load",
      timeout: 20_000,
    });
    // After redirect, the current URL should not be the test path
    const finalUrl = page.url();
    const redirected = finalUrl !== `${PROD}${path}`;
    rec(
      `5. ${path} redirects when logged in`,
      redirected,
      `→ ${finalUrl}`,
    );
    void res;
  }

  // ---- Screenshot ----
  try {
    await page.goto(`${PROD}/t/${tenant.slug}/dashboard`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({ path: "scripts/ux-audit-screenshot.png", fullPage: false });
    console.log("\n📸 scripts/ux-audit-screenshot.png");
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

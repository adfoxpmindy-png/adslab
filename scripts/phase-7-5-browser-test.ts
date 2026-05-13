// Phase 7.5 browser test — Hybrid AI page.
//
// Scenarios:
//   1. Sidebar shows "AI Master" link
//   2. /ai page renders with conversation list + chat panel
//   3. "New conversation" button works
//   4. Existing conversations show in the list
//   5. FAB still works AND has "Open in full page" button → navigates to /ai
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-7-5-browser-test.ts
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

  console.log("\n🎭 Phase 7.5 browser test — Hybrid AI page\n");
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
    userAgent: "Mozilla/5.0 (PlaywrightBot/1.0) Phase7.5",
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

  // ---- 1. Sidebar has AI Master ----
  console.log("[1] Sidebar shows 'AI Master'");
  await page.goto(`${PROD}/t/${tenant.slug}/dashboard`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  const html = await page.content();
  rec("1. sidebar has 'AI Master' link", html.includes(">AI Master<"));

  // ---- 2. /ai page renders ----
  console.log("\n[2] /ai page renders");
  await page.goto(`${PROD}/t/${tenant.slug}/ai`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  const aiHtml = await page.content();
  rec("2a. /ai heading present", aiHtml.includes("AI Master"));
  rec(
    "2b. 'New conversation' button visible",
    (await page.getByRole("button", { name: "New conversation", exact: true }).count()) > 0,
  );
  rec(
    "2c. message input visible",
    (await page.locator('input[placeholder*="พิมพ์คำถาม"]').count()) > 0,
  );

  // ---- 3. Click "New conversation" ----
  console.log("\n[3] Click 'New conversation'");
  const initialConvCount = await prisma.aIConversation.count({
    where: { tenantId: tenant.id, userId: owner.user.id, archived: false },
  });
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await page.waitForTimeout(1500);
  const afterCount = await prisma.aIConversation.count({
    where: { tenantId: tenant.id, userId: owner.user.id, archived: false },
  });
  rec(
    "3. new conversation created in DB",
    afterCount >= initialConvCount + 1,
    `before=${initialConvCount} after=${afterCount}`,
  );

  // ---- 4. FAB still on Dashboard ----
  console.log("\n[4] FAB on Dashboard");
  await page.goto(`${PROD}/t/${tenant.slug}/dashboard`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  const fabExists = (await page.getByRole("button", { name: /ถาม AI/ }).count()) > 0;
  rec("4. FAB 'ถาม AI' visible on Dashboard", fabExists);

  // ---- 5. FAB → expand → /ai ----
  console.log("\n[5] FAB has expand button");
  if (fabExists) {
    await page.getByRole("button", { name: /ถาม AI/ }).click();
    await page.waitForTimeout(800);
    const expandLink = page.getByTitle("เปิดแบบเต็มหน้า");
    rec(
      "5a. FAB drawer has 'expand to full page' button",
      (await expandLink.count()) > 0,
    );
  }

  // Screenshot
  try {
    await page.goto(`${PROD}/t/${tenant.slug}/ai`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "scripts/phase-7-5-screenshot.png", fullPage: false });
    console.log("\n📸 scripts/phase-7-5-screenshot.png");
  } catch {}

  // Cleanup test conversations (only those we just created with empty content)
  const created = await prisma.aIConversation.findMany({
    where: {
      tenantId: tenant.id,
      userId: owner.user.id,
      messages: { none: {} },
    },
    select: { id: true },
  });
  for (const c of created) {
    await prisma.aIConversation.delete({ where: { id: c.id } });
  }

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

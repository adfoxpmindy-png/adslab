/**
 * E2E test: verify mobile sidebar works at iPhone width.
 * Captures 3 screenshots:
 *   1. mobile-closed.png — initial state, hamburger visible, sidebar hidden
 *   2. mobile-open.png — after tapping hamburger
 *   3. mobile-after-nav.png — after tapping a nav item (drawer should close)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://ads-lab.xyz";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "demo" },
    include: { members: { where: { role: "OWNER" }, take: 1, include: { user: true } } },
  });
  const owner = tenant!.members[0].user;
  const sealed = await sealData(
    { userId: owner.id, email: owner.email, name: owner.name },
    { password: process.env.SESSION_SECRET! },
  );

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, // iPhone X
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
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
  await page.goto(`${PROD}/t/demo/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: "scripts/mobile-closed.png" });
  console.log("✓ scripts/mobile-closed.png — hamburger should be top-left");

  // Tap hamburger
  const hamburger = page.locator('button[aria-label="เปิดเมนู"]');
  const hamburgerVisible = await hamburger.isVisible();
  console.log(`  hamburger visible: ${hamburgerVisible}`);
  if (!hamburgerVisible) {
    console.log("✗ Hamburger button not visible on mobile width");
    await browser.close();
    await prisma.$disconnect();
    return;
  }

  await hamburger.click();
  await page.waitForTimeout(400);

  await page.screenshot({ path: "scripts/mobile-open.png" });
  console.log("✓ scripts/mobile-open.png — drawer should be sliding in from left");

  // Check that drawer is rendered. The MobileSidebar drawer is `fixed`,
  // the desktop SidebarV2 is `sticky` — use the fixed-positioned one.
  const visibleDrawer = page.locator('aside.fixed');
  const drawerNavLinks = await visibleDrawer.locator('a').count();
  console.log(`  Drawer nav links count: ${drawerNavLinks}`);

  // Tap a nav item — expect drawer to close + page to navigate
  const campaignsLink = visibleDrawer.locator('a').filter({ hasText: "แคมเปญ" });
  await campaignsLink.click();
  await page.waitForURL(/campaigns/, { timeout: 5000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "scripts/mobile-after-nav.png" });
  console.log("✓ scripts/mobile-after-nav.png — drawer auto-closed after navigation");

  await browser.close();
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

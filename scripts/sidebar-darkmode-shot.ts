/**
 * Capture the new sidebar in BOTH light + dark mode so the user can
 * verify their feedback items are fixed:
 *   1. Logo cropped (no whitespace)
 *   2. Theme toggle in topbar
 *   3. Connect accounts section readable in dark
 *   4. Upgrade card visible
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

  for (const mode of ["light", "dark"] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      colorScheme: mode,
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
    // Persist theme preference too — next-themes uses storageKey "adslab-theme"
    await ctx.addInitScript((m: string) => {
      try {
        localStorage.setItem("adslab-theme", m);
      } catch {}
    }, mode);

    const page = await ctx.newPage();
    await page.goto(`${PROD}/t/demo/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const info = await page.locator("aside").first().evaluate((el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const profile = el.querySelector("[data-sidebar-profile]");
      return {
        asideH: r.height,
        asideY: r.top,
        profileBox: profile ? (profile as HTMLElement).getBoundingClientRect() : null,
        childCount: el.children.length,
      };
    });
    console.log(`  [${mode}] sidebar:`, JSON.stringify(info));
    await page.screenshot({
      path: `scripts/redesign-sidebar-${mode}.png`,
      fullPage: false,
      clip: { x: 0, y: 0, width: 280, height: Math.max(1100, Math.ceil(info.asideH)) },
    });
    console.log(`✓ scripts/redesign-sidebar-${mode}.png`);
    await ctx.close();
  }

  await browser.close();
  await prisma.$disconnect();
}
main().catch(console.error);

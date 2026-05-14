/**
 * Compare the bottom portion of the sidebar across multiple pages.
 * Captures from y=600 down so we see connect-accounts + upgrade (if
 * shown) + user profile — i.e. the "bottom-left" area the user said
 * looks different per page.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://ads-lab.xyz";

const PAGES = [
  "/t/demo/dashboard",
  "/t/demo/campaigns",
  "/t/demo/journey",
  "/t/demo/audiences",
  "/t/demo/reports",
  "/t/demo/events",
  "/t/demo/tools",
];

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

  for (const path of PAGES) {
    const name = path.split("/").pop()!;
    await page.goto(`${PROD}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Measure sidebar height + profile position
    const info = await page.locator("aside").first().evaluate((el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const profile = el.querySelector("[data-sidebar-profile]");
      const connect = Array.from(el.querySelectorAll("p")).find((p) =>
        p.textContent?.includes("เชื่อมต่อบัญชี"),
      );
      return {
        asideH: r.height,
        viewportH: window.innerHeight,
        profileY: profile ? (profile as HTMLElement).getBoundingClientRect().top : null,
        profileH: profile ? (profile as HTMLElement).getBoundingClientRect().height : null,
        connectY: connect
          ? (connect.parentElement as HTMLElement).getBoundingClientRect().top
          : null,
      };
    });
    console.log(`[${name}]`, JSON.stringify(info));

    // Screenshot bottom half of viewport so we see the bottom-left area
    await page.screenshot({
      path: `scripts/sidebar-bottom-${name}.png`,
      clip: { x: 0, y: 450, width: 280, height: 450 },
    });
  }

  await browser.close();
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

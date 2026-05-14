/**
 * Walk through all the redesigned + previously-old pages on prod
 * and capture a topbar+content screenshot for each so we can verify
 * they share the same header pattern (title in topbar, no inline
 * icon-block headers in the page body).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://ads-lab.xyz";

const PAGES = [
  { path: "/t/demo/dashboard", name: "dashboard" },
  { path: "/t/demo/campaigns", name: "campaigns" },
  { path: "/t/demo/audiences", name: "audiences" },
  { path: "/t/demo/reports", name: "reports" },
  { path: "/t/demo/ai-optimize", name: "ai-optimize" },
  { path: "/t/demo/tools", name: "tools" },
  { path: "/t/demo/journey", name: "journey" },
  { path: "/t/demo/ai", name: "ai" },
  { path: "/t/demo/goals", name: "goals" },
  { path: "/t/demo/events", name: "events" },
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

  for (const p of PAGES) {
    try {
      await page.goto(`${PROD}${p.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `scripts/page-${p.name}.png`,
        clip: { x: 0, y: 0, width: 1440, height: 380 },
      });
      console.log(`✓ scripts/page-${p.name}.png`);
    } catch (err) {
      console.log(`✗ ${p.name}: ${(err as Error).message}`);
    }
  }

  await browser.close();
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Capture screenshots of the redesigned pages on prod for visual review.
 * Compares actual implementation against the design mockups.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://ads-lab.xyz";
const TENANT_SLUG = "demo"; // only tenant with Meta ACTIVE — for real data screenshots

async function main() {
  const cs = process.env.DATABASE_URL!;
  const sec = process.env.SESSION_SECRET!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    include: { members: { where: { role: "OWNER" }, take: 1, include: { user: true } } },
  });
  if (!tenant) throw new Error(`Tenant ${TENANT_SLUG} not found`);
  const owner = tenant.members[0].user;

  const sealed = await sealData(
    { userId: owner.id, email: owner.email, name: owner.name },
    { password: sec },
  );

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
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

  const pages: Array<{ name: string; url: string; waitFor?: string }> = [
    { name: "dashboard", url: `${PROD}/t/${TENANT_SLUG}/dashboard` },
    { name: "campaigns-table", url: `${PROD}/t/${TENANT_SLUG}/campaigns` },
    { name: "ai-optimize", url: `${PROD}/t/${TENANT_SLUG}/ai-optimize` },
    { name: "ai-campaign-builder", url: `${PROD}/t/${TENANT_SLUG}/campaigns/ai-new` },
    { name: "competitors", url: `${PROD}/t/${TENANT_SLUG}/competitors` },
  ];

  for (const p of pages) {
    console.log(`📸 Capturing ${p.name}...`);
    try {
      await page.goto(p.url, { waitUntil: "networkidle", timeout: 30000 });
      // Wait briefly for any chart animations
      await page.waitForTimeout(2000);
      const path = `scripts/redesign-${p.name}.png`;
      await page.screenshot({ path, fullPage: true });
      console.log(`  ✓ ${path}`);
    } catch (e) {
      console.log(`  ✗ Failed: ${(e as Error).message}`);
    }
  }

  // Capture the campaigns structure mindmap (after clicking the toggle)
  console.log(`📸 Capturing campaigns-structure...`);
  try {
    await page.goto(`${PROD}/t/${TENANT_SLUG}/campaigns`, { waitUntil: "networkidle" });
    await page.click('button:has-text("โครงสร้าง")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "scripts/redesign-campaigns-structure.png", fullPage: false });
    console.log("  ✓ scripts/redesign-campaigns-structure.png");
  } catch (e) {
    console.log(`  ✗ Failed: ${(e as Error).message}`);
  }

  await browser.close();
  await prisma.$disconnect();
  console.log("\nDone. Compare scripts/redesign-*.png with the original design mockups.");
}

main().catch(console.error);

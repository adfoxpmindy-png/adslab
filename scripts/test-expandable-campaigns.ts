/**
 * E2E test: open the new expandable campaigns table in prod, click
 * the first campaign's expand chevron, and verify ad sets + ads load.
 *
 * Captures three screenshots so we can verify visual correctness:
 *   1. campaigns-table-collapsed.png — initial state, all collapsed
 *   2. campaigns-table-expanded-1.png — one campaign expanded (ad sets visible)
 *   3. campaigns-table-expanded-2.png — one ad set within it expanded too
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
    viewport: { width: 1440, height: 1100 },
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
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`  [browser err] ${msg.text()}`);
  });

  console.log("→ Loading campaigns page...");
  await page.goto(`${PROD}/t/demo/campaigns`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Verify table view is rendered
  const tableButton = page.getByRole("button", { name: /ตาราง/ });
  if (await tableButton.isVisible()) {
    await tableButton.click();
    await page.waitForTimeout(500);
  }

  // Count rows
  const rowCount = await page.locator("tbody tr").count();
  console.log(`  Found ${rowCount} campaign rows`);
  if (rowCount === 0) {
    console.log("✗ No campaigns to expand. Aborting.");
    await browser.close();
    await prisma.$disconnect();
    return;
  }

  // Screenshot 1: collapsed state
  await page.screenshot({
    path: "scripts/campaigns-table-collapsed.png",
    fullPage: false,
  });
  console.log("✓ scripts/campaigns-table-collapsed.png");

  // Click first chevron — uses aria-label "Expand"
  const firstChevron = page.locator('button[aria-label="Expand"]').first();
  await firstChevron.click();

  // Wait for the structure to load. Listen for the API call to settle.
  console.log("→ Waiting for /api/meta/campaigns/.../structure response...");
  try {
    const apiResponse = await page.waitForResponse(
      (res) => res.url().includes("/api/meta/campaigns/") && res.url().includes("/structure"),
      { timeout: 30000 },
    );
    const status = apiResponse.status();
    console.log(`  API responded ${status}`);
    if (status !== 200) {
      const body = await apiResponse.text();
      console.log(`  body: ${body.slice(0, 300)}`);
    } else {
      const body = (await apiResponse.json()) as {
        adSets: Array<{ id: string; name: string; ads: Array<{ id: string }> }>;
      };
      console.log(`  ↳ ${body.adSets.length} ad sets returned`);
      body.adSets.slice(0, 3).forEach((a) =>
        console.log(`    - ${a.name} (${a.ads.length} ads)`),
      );
    }
  } catch (err) {
    console.log(`✗ API never responded: ${(err as Error).message}`);
  }

  await page.waitForTimeout(1500);

  // Screenshot 2: campaign expanded, ad sets visible — zoom to top of table
  const tableEl = page.locator("table").first();
  const tableBox = await tableEl.boundingBox();
  if (tableBox) {
    await page.screenshot({
      path: "scripts/campaigns-table-expanded-1.png",
      clip: {
        x: tableBox.x,
        y: tableBox.y,
        width: Math.min(1400, tableBox.width),
        height: Math.min(400, tableBox.height),
      },
    });
  } else {
    await page.screenshot({ path: "scripts/campaigns-table-expanded-1.png" });
  }
  console.log("✓ scripts/campaigns-table-expanded-1.png");

  // Try to expand the first ad set (chevron at depth=1)
  const adSetChevrons = page.locator('button[aria-label="Expand"]');
  const chevronCount = await adSetChevrons.count();
  console.log(`  Chevron count after expand: ${chevronCount}`);

  if (chevronCount >= 1) {
    // index 0 is now the campaign's collapse, index 1+ are ad sets
    await adSetChevrons.nth(0).click();
    await page.waitForTimeout(800);
    const tableBox2 = await tableEl.boundingBox();
    if (tableBox2) {
      await page.screenshot({
        path: "scripts/campaigns-table-expanded-2.png",
        clip: {
          x: tableBox2.x,
          y: tableBox2.y,
          width: Math.min(1400, tableBox2.width),
          height: Math.min(450, tableBox2.height),
        },
      });
    } else {
      await page.screenshot({ path: "scripts/campaigns-table-expanded-2.png" });
    }
    console.log("✓ scripts/campaigns-table-expanded-2.png");
  }

  await browser.close();
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

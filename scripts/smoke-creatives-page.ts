/**
 * Smoke test: load /creatives + Campaign Builder image step to verify
 * the new library UI renders without errors. We can't test actual
 * upload without BLOB_READ_WRITE_TOKEN set on Vercel.
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
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // 1) Creatives library page loads with KPIs + empty state
  await page.goto(`${PROD}/t/demo/creatives`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "scripts/creatives-page.png", fullPage: false });
  console.log("✓ /creatives loaded");

  // Look for KPI cards
  const kpiTitles = await page.locator("text=ภาพ").count();
  console.log(`  KPI 'ภาพ' visible: ${kpiTitles > 0}`);

  // Click upload button
  const uploadBtn = page.getByRole("button", { name: /อัปโหลด/ }).first();
  if (await uploadBtn.isVisible()) {
    await uploadBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "scripts/creatives-upload-modal.png", fullPage: false });
    console.log("✓ Upload modal opens");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // 2) Campaign Builder shows new "เลือกจากคลัง" toggle
  await page.goto(`${PROD}/t/demo/campaigns/new`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  const fromLibraryToggle = page.locator("text=เลือกจากคลัง");
  const exists = await fromLibraryToggle.count();
  console.log(`  Campaign Builder "เลือกจากคลัง" toggle visible: ${exists > 0}`);

  if (exists > 0) {
    await fromLibraryToggle.first().click();
    await page.waitForTimeout(400);
    // Click the picker trigger
    const pickerTrigger = page.getByText("กดเพื่อเลือกจากคลัง creatives");
    if (await pickerTrigger.isVisible()) {
      await pickerTrigger.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "scripts/campaign-builder-library-picker.png", fullPage: false });
      console.log("✓ Library picker opens from Campaign Builder");
    }
  }

  if (errors.length > 0) {
    console.log("\n⚠ Browser errors detected:");
    for (const e of errors.slice(0, 5)) console.log(`  ${e.slice(0, 200)}`);
  }

  await browser.close();
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

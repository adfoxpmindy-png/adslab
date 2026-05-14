import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto("https://ads-lab.xyz/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/redesign-landing-public.png", fullPage: true });
  console.log("✓ scripts/redesign-landing-public.png");
  await browser.close();
}
main();

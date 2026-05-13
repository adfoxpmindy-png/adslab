import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://adslab-theta.vercel.app";

async function main() {
  const cs = process.env.DATABASE_URL!;
  const sec = process.env.SESSION_SECRET!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant!.id, role: "OWNER" },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  const sealed = await sealData(
    { userId: owner!.user.id, email: owner!.user.email, name: owner!.user.name },
    { password: sec },
  );

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
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
  await page.goto(`${PROD}/t/${tenant!.slug}/journey`, { waitUntil: "networkidle" });
  // Give the journey extractor time — first fetch can hit Meta API for
  // a fresh insights snapshot if the cache is empty.
  await page.waitForTimeout(12_000);
  await page.screenshot({ path: "scripts/journey-screenshot.png" });
  console.log("📸 scripts/journey-screenshot.png");
  await browser.close();
  await prisma.$disconnect();
}

main().catch(console.error);

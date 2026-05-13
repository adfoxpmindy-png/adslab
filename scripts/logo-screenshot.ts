// Quick browser screenshot of the logo placements after deploy.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/logo-screenshot.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = process.env.SMOKE_BASE_URL ?? "https://adslab-theta.vercel.app";

async function main() {
  const cs = process.env.DATABASE_URL;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!cs || !sessionSecret) throw new Error("env missing");

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
    { password: sessionSecret },
  );

  const browser = await chromium.launch({ headless: true });

  // 1. Login page (no cookie)
  const loginCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const loginPage = await loginCtx.newPage();
  await loginPage.goto(`${PROD}/login`, { waitUntil: "networkidle" });
  await loginPage.screenshot({ path: "scripts/logo-login.png" });
  console.log("📸 scripts/logo-login.png");
  await loginCtx.close();

  // 2. Dashboard (logged in) — sidebar logo
  const dashCtx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  await dashCtx.addCookies([
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
  const dashPage = await dashCtx.newPage();
  await dashPage.goto(`${PROD}/t/${tenant!.slug}/dashboard`, {
    waitUntil: "networkidle",
  });
  await dashPage.screenshot({ path: "scripts/logo-dashboard.png" });
  console.log("📸 scripts/logo-dashboard.png");
  await dashCtx.close();

  await browser.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

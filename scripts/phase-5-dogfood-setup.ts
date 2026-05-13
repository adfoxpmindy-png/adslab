// Set up AdsLab self-tracking via Phase 5 SDK.
//
// Steps:
//   1. Find demo tenant + first active ad account
//   2. Fetch pixels for that account (Meta API)
//   3. Pick the first pixel (or fail if none — user must create one)
//   4. Generate siteKey + print it for env var setup
//   5. Seed EventRules covering AdsLab key user actions
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-5-dogfood-setup.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getFreshAccessToken } from "../src/lib/meta/client";
import { graphFetch } from "../src/lib/meta/graph-api";
import { generateSiteKey } from "../src/lib/event-sdk/site-key";

type RuleSeed = {
  name: string;
  triggerType: "url" | "click" | "form_submit" | "scroll" | "time_on_page" | "custom_js";
  conditions: Record<string, unknown>;
  eventName: string;
};

const RULES: RuleSeed[] = [
  // Conversion funnel — signup → verify → first campaign
  {
    name: "Signup form submit",
    triggerType: "form_submit",
    conditions: { selector: 'form[action*="signup"], form[data-track="signup"]' },
    eventName: "Lead",
  },
  {
    name: "Email verified (completed registration)",
    triggerType: "url",
    conditions: { op: "contains", value: "/verify-email", fireOnce: true },
    eventName: "CompleteRegistration",
  },
  {
    name: "Started trial (visit campaign builder)",
    triggerType: "url",
    conditions: { op: "contains", value: "/campaigns/new", fireOnce: true },
    eventName: "StartTrial",
  },
  // Engagement — deep page views
  {
    name: "Dashboard view",
    triggerType: "url",
    conditions: { op: "contains", value: "/dashboard" },
    eventName: "ViewContent",
  },
  {
    name: "Reports view",
    triggerType: "url",
    conditions: { op: "contains", value: "/reports" },
    eventName: "ViewContent",
  },
  {
    name: "Campaigns list view",
    triggerType: "url",
    conditions: { op: "equals", value: "campaigns_list_marker_unused" },
    eventName: "ViewContent",
  },
  // Time-on-page = engagement proxy
  {
    name: "Engaged user (30s on page)",
    triggerType: "time_on_page",
    conditions: { seconds: 30 },
    eventName: "ViewContent",
  },
  // Scroll-depth = content read
  {
    name: "Deep scroll (75%)",
    triggerType: "scroll",
    conditions: { percent: 75 },
    eventName: "ViewContent",
  },
  // Contact / data deletion = support intent
  {
    name: "Data deletion page view",
    triggerType: "url",
    conditions: { op: "contains", value: "/data-deletion", fireOnce: true },
    eventName: "Contact",
  },
];

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🐶 AdsLab dogfood setup — Phase 5 SDK on AdsLab itself\n");

  // 1. Find tenant
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant with active Meta connection");
  console.log(`[1] Tenant: ${tenant.name} (${tenant.slug}, ${tenant.id})`);

  // 2. Find active ad account
  const account = await prisma.metaAdAccount.findFirst({
    where: {
      connection: { tenantId: tenant.id },
      accountStatus: 1,
    },
    select: {
      id: true,
      metaAccountId: true,
      name: true,
      businessId: true,
      businessName: true,
      connection: {
        select: {
          id: true,
          tenantId: true,
          accessTokenEncrypted: true,
          tokenExpiresAt: true,
          metaUserId: true,
          metaUserName: true,
          status: true,
          connectedAt: true,
          lastSyncedAt: true,
        },
      },
    },
  });
  if (!account) throw new Error("No active ad account");
  console.log(`[2] Ad account: ${account.name} (${account.metaAccountId})`);
  console.log(`    BM: ${account.businessName ?? "(none)"}`);

  // 3. Fetch pixels for this account
  const token = await getFreshAccessToken(account.connection);
  type RawPixel = { id: string; name: string };
  const pixelRes = await graphFetch<{ data: RawPixel[] }>(
    `/${account.metaAccountId}/adspixels`,
    {
      accessToken: token,
      searchParams: { fields: "id,name", limit: 10 },
    },
  );
  if (pixelRes.data.length === 0) {
    console.log("\n❌ No pixel on this ad account.");
    console.log("Create one first via Audiences → Pixels → '+ สร้าง Pixel'");
    process.exit(1);
  }
  const pixel = pixelRes.data[0];
  console.log(`[3] Pixel: ${pixel.name} (${pixel.id})`);

  // 4. Generate siteKey
  const siteKey = generateSiteKey(tenant.id, pixel.id);
  console.log(`\n[4] siteKey generated:`);
  console.log(`    ${siteKey}\n`);

  // 5. Seed rules — first wipe existing seed rules to allow rerun
  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { userId: true },
  });
  if (!owner) throw new Error("No OWNER user in tenant");

  // Idempotent: drop any rules for this pixel that match our seed names,
  // then recreate. Keeps runs predictable.
  const seedNames = RULES.map((r) => r.name);
  const removed = await prisma.eventRule.deleteMany({
    where: {
      tenantId: tenant.id,
      pixelId: pixel.id,
      name: { in: seedNames },
    },
  });
  if (removed.count > 0) {
    console.log(`[5] Removed ${removed.count} existing seed rules (rerun)`);
  }

  // Special-case: "Campaigns list view" condition needs to match
  // exactly the campaigns list URL. /t/<slug>/campaigns ends with
  // /campaigns (not /campaigns/new). Use ends-with-style regex via
  // not_contains + contains combo isn't expressible; use regex op.
  RULES.find((r) => r.name === "Campaigns list view")!.conditions = {
    op: "regex",
    value: "/t/[^/]+/campaigns(\\?|$|#)",
    fireOnce: false,
  };

  let created = 0;
  for (const seed of RULES) {
    await prisma.eventRule.create({
      data: {
        tenantId: tenant.id,
        createdByUserId: owner.userId,
        pixelId: pixel.id,
        name: seed.name,
        triggerType: seed.triggerType,
        conditions: seed.conditions as never,
        eventName: seed.eventName,
        enabled: true,
      },
    });
    created++;
  }
  console.log(`[5] Created ${created} event rules`);

  console.log(`\n=== Next steps ===`);
  console.log(`1. Set env var on Vercel:`);
  console.log(`   npx vercel env add NEXT_PUBLIC_ADSLAB_SITE_KEY production`);
  console.log(`   (paste: ${siteKey})`);
  console.log(`\n2. Confirm root layout reads NEXT_PUBLIC_ADSLAB_SITE_KEY + injects SDK`);
  console.log(`\n3. Redeploy: npx vercel --prod`);
  console.log(`\n4. Visit prod pages, check /t/${tenant.slug}/events for fires`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

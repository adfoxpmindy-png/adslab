// Test create campaign with CBO + bid_strategy at campaign level.
// Cleans up created entities. Run before deploying any UI changes.
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

type CookieJar = { value: string };
async function api(
  path: string,
  init: RequestInit & { cookieJar?: CookieJar } = {},
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.cookieJar?.value) headers.set("Cookie", init.cookieJar.value);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const sc = res.headers.get("set-cookie");
  if (sc && init.cookieJar) {
    const m = sc.match(/^([^;]+)/);
    if (m) init.cookieJar.value = m[1];
  }
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body };
}

async function main() {
  console.log("\n🧪 Test: Create campaign with CBO + bid_strategy fix\n");

  const cs = process.env.DATABASE_URL!;
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: cs }) });

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: {
      id: true,
      slug: true,
      metaConnection: { select: { id: true } },
      members: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true } } },
        take: 1,
      },
    },
  });
  if (!tenant) throw new Error("no tenant");
  const owner = tenant.members[0].user;

  const adAccount = await prisma.metaAdAccount.findFirst({
    where: { metaConnectionId: tenant.metaConnection!.id, accountStatus: 1 },
    select: { metaAccountId: true },
  });
  if (!adAccount) throw new Error("no ad account");

  const page = await prisma.metaPage.findFirst({
    where: { metaConnectionId: tenant.metaConnection!.id },
    select: { metaPageId: true, name: true },
  });
  if (!page) throw new Error("no page");

  const jar: CookieJar = { value: "" };
  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: owner.email, password: "admin123" }),
    cookieJar: jar,
  });

  // Reuse an existing image hash from any of the founder's recent ads
  // — avoids needing to upload a real 600×600+ image just to test the
  // bid_strategy fix. We grab any creative the connection has.
  const { graphFetch: gf } = await import("../src/lib/meta/graph-api");
  const { getFreshAccessToken: getToken } = await import("../src/lib/meta/client");
  const conn0 = await prisma.metaConnection.findUnique({
    where: { id: tenant.metaConnection!.id },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  const tk = await getToken(conn0!);
  const adImages = await gf<{ data: { hash: string }[] }>(
    `/${adAccount.metaAccountId}/adimages`,
    { accessToken: tk, searchParams: { fields: "hash", limit: 1 } },
  );
  const imageHash = adImages.data?.[0]?.hash;
  if (!imageHash) {
    console.log("❌ No existing image to reuse — test cannot proceed");
    process.exit(1);
  }
  console.log(`Using existing image hash: ${imageHash}`);

  // Create CBO campaign with TRAFFIC objective + LINK_CLICKS (simplest path that works)
  const payload = {
    metaAccountId: adAccount.metaAccountId,
    campaignName: `[CBO TEST] ${Date.now()}`,
    objective: "OUTCOME_TRAFFIC",
    specialAdCategories: ["NONE"],
    budgetMode: "CBO",
    campaignDailyBudget: 50,
    adSetName: "Test Ad Set",
    targeting: {
      geo_locations: { countries: ["TH"] },
      age_min: 20, // Meta requires ≥ 20 in Thailand
      age_max: 65,
    },
    optimizationGoal: "LINK_CLICKS",
    billingEvent: "IMPRESSIONS",
    adName: "Test Ad",
    pageId: page.metaPageId,
    creative: {
      kind: "new_image",
      imageHash,
      primaryText: "Test ad — please ignore. Will be deleted shortly.",
      linkUrl: "https://example.com",
      callToAction: "LEARN_MORE",
    },
  };
  console.log("\nCreate campaign (CBO + bid_strategy at campaign level)...");
  const t0 = Date.now();
  const res = await api(`/api/meta/campaigns/create?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify(payload),
    cookieJar: jar,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Result (${elapsed}s):`, res.status, JSON.stringify(res.body).slice(0, 500));

  if (res.status >= 200 && res.status < 300) {
    console.log("\n✅ Campaign created successfully!");
    console.log(`   Campaign: ${res.body.campaign.name} (${res.body.campaign.metaId})`);
    console.log(`   Ad Set:   ${res.body.adSet.metaId}`);
    console.log(`   Ad:       ${res.body.ad.metaId}`);

    // Cleanup
    console.log("\nCleaning up...");
    const { graphFetch } = await import("../src/lib/meta/graph-api");
    const { getFreshAccessToken } = await import("../src/lib/meta/client");
    const conn = await prisma.metaConnection.findUnique({
      where: { id: tenant.metaConnection!.id },
      select: {
        id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
        metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
      },
    });
    const token = await getFreshAccessToken(conn!);
    await graphFetch(`/${res.body.campaign.metaId}`, { method: "DELETE", accessToken: token });
    console.log(`   ✓ deleted ${res.body.campaign.metaId}`);
    await prisma.metaCampaign.deleteMany({
      where: { metaCampaignId: res.body.campaign.metaId },
    });
  } else {
    console.log("\n❌ Campaign creation FAILED");
    console.log("   Error:", res.body.error);
    console.log("   Failed at:", res.body.failedAt);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("❌ Script failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

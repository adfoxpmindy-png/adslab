// Test: create a campaign using "existing post" creative path
// — both /promotable_posts fetch AND pfbid resolution
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

(async () => {
  const p = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });

  // Login
  const tenant = await p.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: {
      id: true,
      slug: true,
      metaConnection: { select: { id: true } },
      members: { where: { role: "OWNER" }, select: { user: { select: { email: true } } }, take: 1 },
    },
  });
  if (!tenant) throw new Error("no tenant");

  const headers: HeadersInit = { "Content-Type": "application/json" };
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: tenant.members[0].user.email, password: "admin123" }),
    redirect: "manual",
  });
  const cookie = loginRes.headers.get("set-cookie")?.match(/^([^;]+)/)?.[1] ?? "";
  console.log("Login:", loginRes.status);

  // Get pages
  const pagesRes = await fetch(`${BASE}/api/meta/pages?tenantSlug=${tenant.slug}`, {
    headers: { Cookie: cookie },
  });
  const pagesData = await pagesRes.json();
  console.log(`\nPages available: ${pagesData.pages?.length ?? 0}`);

  if (!pagesData.pages?.length) {
    console.log("❌ No pages");
    process.exit(1);
  }

  // Test each page's /posts endpoint until one returns posts
  console.log("\n--- Probing /posts endpoint per page ---");
  let workingPage: { id: string; name: string } | null = null;
  let workingPostId: string | null = null;
  for (const page of pagesData.pages.slice(0, 10)) {
    const r = await fetch(
      `${BASE}/api/meta/pages/${page.id}/posts?tenantSlug=${tenant.slug}`,
      { headers: { Cookie: cookie } },
    );
    const d = await r.json();
    const status = r.status === 200 ? "✓" : "✗";
    const summary = r.status === 200
      ? `${d.posts?.length ?? 0} posts (source=${d.source})`
      : `error: ${typeof d.error === "string" ? d.error.slice(0, 80) : "unknown"}`;
    console.log(`${status} ${page.name.padEnd(30)} → ${summary}`);
    if (r.status === 200 && d.posts?.length && !workingPage) {
      workingPage = { id: page.id, name: page.name };
      workingPostId = d.posts[0].id;
    }
  }

  if (!workingPage || !workingPostId) {
    console.log("\n❌ No page has accessible posts for testing");
    process.exit(1);
  }

  console.log(`\n--- Using "${workingPage.name}" with post ${workingPostId} ---`);

  // Get an ad account
  const adAccount = await p.metaAdAccount.findFirst({
    where: { accountStatus: 1 },
    select: { metaAccountId: true, name: true },
  });
  console.log(`Ad account: ${adAccount?.name} (${adAccount?.metaAccountId})`);

  // Create campaign with existing-post creative
  console.log("\n--- Creating campaign with existing-post creative ---");
  const t0 = Date.now();
  const createRes = await fetch(
    `${BASE}/api/meta/campaigns/create?tenantSlug=${tenant.slug}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        metaAccountId: adAccount!.metaAccountId,
        campaignName: `[EXISTING POST TEST] ${Date.now()}`,
        objective: "OUTCOME_ENGAGEMENT",
        specialAdCategories: ["NONE"],
        budgetMode: "CBO",
        campaignDailyBudget: 50,
        adSetName: "Test Ad Set",
        targeting: { geo_locations: { countries: ["TH"] }, age_min: 20, age_max: 65 },
        optimizationGoal: "CONVERSATIONS",
        billingEvent: "IMPRESSIONS",
        adName: "Test Ad",
        pageId: workingPage.id,
        creative: { kind: "existing_post", postId: workingPostId },
      }),
    },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = await createRes.json();
  console.log(`Result (${elapsed}s):`, createRes.status);
  console.log(JSON.stringify(data, null, 2).slice(0, 800));

  if (createRes.ok) {
    console.log("\n✅ SUCCESS — existing-post creative path works!");
    // Cleanup
    const { graphFetch } = await import("../src/lib/meta/graph-api");
    const { getFreshAccessToken } = await import("../src/lib/meta/client");
    const conn = await p.metaConnection.findFirst({
      where: { status: "ACTIVE" },
      select: {
        id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
        metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
      },
    });
    const token = await getFreshAccessToken(conn!);
    await graphFetch(`/${data.campaign.metaId}`, { method: "DELETE", accessToken: token });
    await p.metaCampaign.deleteMany({ where: { metaCampaignId: data.campaign.metaId } });
    console.log(`✓ Cleaned up ${data.campaign.metaId}`);
  } else {
    console.log("\n❌ FAILED");
    if (data.partial?.campaignMetaId) {
      console.log(`Cleaning up partial campaign ${data.partial.campaignMetaId}...`);
      const { graphFetch } = await import("../src/lib/meta/graph-api");
      const { getFreshAccessToken } = await import("../src/lib/meta/client");
      const conn = await p.metaConnection.findFirst({
        where: { status: "ACTIVE" },
        select: {
          id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
          metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
        },
      });
      const token = await getFreshAccessToken(conn!);
      try {
        await graphFetch(`/${data.partial.campaignMetaId}`, { method: "DELETE", accessToken: token });
        await p.metaCampaign.deleteMany({ where: { metaCampaignId: data.partial.campaignMetaId } });
        console.log(`✓ Cleaned up`);
      } catch (e) {
        console.log(`✗ Cleanup error: ${(e as Error).message}`);
      }
    }
  }
  process.exit(0);
})();

// Test existing-post with a POST THAT HAS A LINK
// to verify TRAFFIC + LINK_CLICKS works when post is suitable.
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

(async () => {
  const p = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });

  const tenant = await p.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: {
      id: true, slug: true,
      metaConnection: { select: { id: true } },
      members: { where: { role: "OWNER" }, select: { user: { select: { email: true } } }, take: 1 },
    },
  });
  if (!tenant) throw new Error("no tenant");
  const owner = tenant.members[0].user;

  // Login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: owner.email, password: "admin123" }),
    redirect: "manual",
  });
  const cookie = loginRes.headers.get("set-cookie")?.match(/^([^;]+)/)?.[1] ?? "";

  // Find a post with attachment.url across multiple pages via direct API
  const { graphFetch } = await import("../src/lib/meta/graph-api");
  const { getPageAccessToken } = await import("../src/lib/meta/pages");
  const pages = await p.metaPage.findMany({
    where: { metaConnectionId: tenant.metaConnection!.id },
    take: 30,
    select: { metaPageId: true, name: true },
  });

  let postWithLink: { id: string; pageId: string; pageName: string; link: string } | null = null;
  for (const page of pages) {
    try {
      const token = await getPageAccessToken(tenant.id, page.metaPageId);
      const res = await graphFetch<{
        data: Array<{ id: string; message?: string; attachments?: { data?: Array<{ url?: string; type?: string }> } }>;
      }>(`/${page.metaPageId}/posts`, {
        accessToken: token,
        searchParams: { fields: "id,message,attachments{url,type}", limit: 25 },
      });
      // Accept ANY post with an attachment.url — Facebook Shop links count,
      // as long as Meta treats it as a "link post".
      const match = res.data.find((p) => p.attachments?.data?.[0]?.url);
      if (match) {
        postWithLink = {
          id: match.id,
          pageId: page.metaPageId,
          pageName: page.name,
          link: match.attachments!.data![0].url!,
        };
        console.log(`Probed ${page.name} — found link post`);
        break;
      } else {
        console.log(`Probed ${page.name} — no link in first 25 posts`);
      }
    } catch {}
  }

  if (!postWithLink) {
    console.log(`❌ ไม่เจอ post ที่มี link ใน ${pages.length} pages แรก`);
    process.exit(1);
  }

  console.log(`Found post with link:`);
  console.log(`  Page: ${postWithLink.pageName}`);
  console.log(`  Post: ${postWithLink.id}`);
  console.log(`  Link: ${postWithLink.link}\n`);

  const adAccount = await p.metaAdAccount.findFirst({
    where: { accountStatus: 1 },
    select: { metaAccountId: true, name: true },
  });

  console.log("Creating TRAFFIC + LINK_CLICKS with this linked post...");
  const t0 = Date.now();
  const createRes = await fetch(
    `${BASE}/api/meta/campaigns/create?tenantSlug=${tenant.slug}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        metaAccountId: adAccount!.metaAccountId,
        campaignName: `[LINKED POST TEST] ${Date.now()}`,
        objective: "OUTCOME_TRAFFIC",
        specialAdCategories: ["NONE"],
        budgetMode: "CBO",
        campaignDailyBudget: 50,
        adSetName: "Test Ad Set",
        targeting: { geo_locations: { countries: ["TH"] }, age_min: 20, age_max: 65 },
        optimizationGoal: "LINK_CLICKS",
        billingEvent: "IMPRESSIONS",
        adName: "Test Ad",
        pageId: postWithLink.pageId,
        creative: { kind: "existing_post", postId: postWithLink.id },
      }),
    },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = await createRes.json();
  console.log(`Result (${elapsed}s):`, createRes.status);
  console.log(JSON.stringify(data, null, 2).slice(0, 600));

  if (createRes.ok) {
    console.log("\n✅ SUCCESS — existing post + TRAFFIC + LINK_CLICKS works when post has link!");
    const { graphFetch: gf } = await import("../src/lib/meta/graph-api");
    const { getFreshAccessToken } = await import("../src/lib/meta/client");
    const conn = await p.metaConnection.findFirst({
      where: { status: "ACTIVE" },
      select: {
        id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
        metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
      },
    });
    const token = await getFreshAccessToken(conn!);
    await gf(`/${data.campaign.metaId}`, { method: "DELETE", accessToken: token });
    await p.metaCampaign.deleteMany({ where: { metaCampaignId: data.campaign.metaId } });
    console.log("✓ cleaned up");
  } else {
    console.log("\n❌ Failed");
    if (data.partial?.campaignMetaId) {
      const { graphFetch: gf } = await import("../src/lib/meta/graph-api");
      const { getFreshAccessToken } = await import("../src/lib/meta/client");
      const conn = await p.metaConnection.findFirst({
        where: { status: "ACTIVE" },
        select: {
          id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
          metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
        },
      });
      const token = await getFreshAccessToken(conn!);
      try { await gf(`/${data.partial.campaignMetaId}`, { method: "DELETE", accessToken: token }); } catch {}
      await p.metaCampaign.deleteMany({ where: { metaCampaignId: data.partial.campaignMetaId } });
    }
  }
  process.exit(0);
})();

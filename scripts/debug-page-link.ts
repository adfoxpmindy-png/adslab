/**
 * Investigate why EV Plaza posts return "not promotable":
 *   1. Can user read the Page directly? (= Page admin role check)
 *   2. Is the Page connected to the same Business Manager?
 *   3. What Pages are accessible from the ad account?
 *   4. What Pages does the user have access to via /me/accounts?
 *   5. Try reading a post via the PAGE access token (not user token)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const PAGE_ID = "110409746982988"; // EV Plaza
const AD_ACCOUNT = "act_9800533156663500";
const TEST_POST = "110409746982988_1015360974392298";

async function fb(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  return { status: res.status, body: await res.json() };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);

  console.log("━━━ 1. Read Page directly with user token ━━━");
  const page = await fb(`/${PAGE_ID}`, userToken, {
    fields: "id,name,access_token,tasks,fan_count,is_published,business",
  });
  console.log(`  status: ${page.status}`);
  console.log(`  body: ${JSON.stringify(page.body, null, 2)}`);

  console.log("\n━━━ 2. List Pages user has admin role for (/me/accounts) ━━━");
  const accounts = await fb("/me/accounts", userToken, {
    fields: "id,name,access_token,tasks",
    limit: "50",
  });
  console.log(`  status: ${accounts.status}`);
  const pages = (accounts.body as { data?: Array<{ id: string; name: string; tasks?: string[] }> })
    .data ?? [];
  console.log(`  Pages user owns/admins: ${pages.length}`);
  const evPlaza = pages.find((p) => p.id === PAGE_ID);
  console.log(`  EV Plaza in list?: ${evPlaza ? "YES" : "NO"}`);
  if (evPlaza) console.log(`    tasks: ${JSON.stringify(evPlaza.tasks)}`);
  console.log(`  First 5 page names: ${pages.slice(0, 5).map((p) => p.name).join(", ")}`);

  console.log("\n━━━ 3. Pages connected to ad account ━━━");
  const acctPages = await fb(`/${AD_ACCOUNT}/promote_pages`, userToken, {
    fields: "id,name",
    limit: "50",
  });
  console.log(`  status: ${acctPages.status}`);
  const apList = (acctPages.body as { data?: Array<{ id: string; name: string }> }).data ?? [];
  console.log(`  Pages account can promote: ${apList.length}`);
  console.log(`  EV Plaza in promote_pages?: ${apList.find((p) => p.id === PAGE_ID) ? "YES" : "NO"}`);
  if (apList.length > 0) {
    console.log(`  All: ${apList.map((p) => `${p.name}(${p.id})`).join(", ")}`);
  }

  console.log("\n━━━ 4. Page's promotable_posts (what Meta SAYS is boostable) ━━━");
  const promoPosts = await fb(`/${PAGE_ID}/promotable_posts`, userToken, {
    fields: "id,created_time,message,is_eligible_for_promotion",
    limit: "5",
  });
  console.log(`  status: ${promoPosts.status}`);
  console.log(`  body: ${JSON.stringify(promoPosts.body, null, 2).slice(0, 600)}`);

  console.log("\n━━━ 5. Try with PAGE access token if we got one ━━━");
  const pageToken = (page.body as { access_token?: string }).access_token;
  if (pageToken) {
    const post = await fb(`/${TEST_POST}`, pageToken, {
      fields: "id,is_eligible_for_promotion,ineligible_promotion_reasons,created_time,type",
    });
    console.log(`  status: ${post.status}`);
    console.log(`  body: ${JSON.stringify(post.body, null, 2)}`);
  } else {
    console.log("  no page token — user is not Page admin");
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

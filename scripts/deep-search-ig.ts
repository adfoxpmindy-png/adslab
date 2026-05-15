/**
 * Deeper IG investigation:
 * 1. List ALL pages with full IG-related fields
 * 2. Check CPS page (124772487582930) directly for IG via multiple field names
 * 3. Try resolving the IG shortcode via oEmbed
 * 4. Check Business Manager owned IG accounts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CPS_PAGE = "124772487582930";
const SHORTCODE = "DYURHCBA8NQ";

async function fb<T = unknown>(path: string, token: string): Promise<T> {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString());
  return (await r.json()) as T;
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);

  // 1. List all pages with as many IG-related fields as possible
  console.log("━━━ 1. ALL pages w/ IG-related fields ━━━");
  let cursor = "";
  const allPages: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 5; i++) {
    const u = new URL("https://graph.facebook.com/v23.0/me/accounts");
    u.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account,connected_instagram_account",
    );
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("after", cursor);
    u.searchParams.set("access_token", userToken);
    const r = await fetch(u.toString());
    const b = (await r.json()) as {
      data?: Array<Record<string, unknown>>;
      paging?: { cursors?: { after?: string } };
    };
    for (const p of b.data ?? []) {
      if (p.instagram_business_account || p.connected_instagram_account) {
        allPages.push(p);
      }
    }
    if (!b.paging?.cursors?.after) break;
    cursor = b.paging.cursors.after;
  }
  console.log(`Found ${allPages.length} pages with IG fields:`);
  for (const p of allPages) {
    const ig = p.instagram_business_account as { id: string } | undefined;
    const cig = p.connected_instagram_account as { id: string } | undefined;
    console.log(`  - ${p.name} (${p.id}) | IG biz=${ig?.id ?? "-"} | connected=${cig?.id ?? "-"}`);
  }

  // 2. Try CPS page directly with all possible IG field names
  console.log(`\n━━━ 2. CPS page (${CPS_PAGE}) direct query for IG ━━━`);
  const pagePart = await fb<Record<string, unknown>>(
    `/${CPS_PAGE}?fields=id,name,instagram_business_account,connected_instagram_account,instagram_accounts,page_token,owner_business`,
    userToken,
  );
  console.log(JSON.stringify(pagePart, null, 2));

  // 3. Try Instagram oEmbed (public endpoint, no permission needed)
  console.log(`\n━━━ 3. Instagram oEmbed for shortcode ━━━`);
  const oembedRes = await fetch(
    `https://graph.facebook.com/v23.0/instagram_oembed?url=${encodeURIComponent(`https://www.instagram.com/reel/${SHORTCODE}/`)}&access_token=${userToken}`,
  );
  console.log(`status: ${oembedRes.status}`);
  console.log(JSON.stringify(await oembedRes.json(), null, 2).slice(0, 1000));

  // 4. Check user's owned businesses → their IG accounts
  console.log(`\n━━━ 4. User's businesses + their IG accounts ━━━`);
  const biz = await fb<{ data?: Array<{ id: string; name: string }> }>(
    `/me/businesses?fields=id,name&limit=20`,
    userToken,
  );
  console.log(`Businesses: ${(biz.data ?? []).length}`);
  for (const b of biz.data ?? []) {
    console.log(`\n  ${b.name} (${b.id})`);
    const igAccts = await fb<{ data?: Array<{ id: string; username?: string }>; error?: { message: string } }>(
      `/${b.id}/instagram_accounts?fields=id,username,name&limit=50`,
      userToken,
    );
    if (igAccts.error) {
      console.log(`    IG accounts err: ${igAccts.error.message}`);
    } else {
      for (const ig of igAccts.data ?? []) {
        console.log(`    IG: ${ig.username ?? "-"} (${ig.id})`);
      }
    }
    // owned ig accounts on business
    const ownedIg = await fb<{ data?: Array<{ id: string; username?: string }>; error?: { message: string } }>(
      `/${b.id}/owned_instagram_accounts?fields=id,username,name&limit=50`,
      userToken,
    );
    if (ownedIg.error) {
      console.log(`    owned IG err: ${ownedIg.error.message}`);
    } else {
      for (const ig of ownedIg.data ?? []) {
        console.log(`    owned IG: ${ig.username ?? "-"} (${ig.id})`);
      }
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);

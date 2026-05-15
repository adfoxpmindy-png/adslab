/**
 * Find which IG business account contains shortcode DYURHCBA8NQ
 * by scanning all FB pages user admins → their IG accounts → recent media.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const SHORTCODE = "DYURHCBA8NQ";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);

  // List all pages w/ IG link + token
  console.log("→ Listing all FB pages with linked IG accounts...");
  const pagesWithIg: Array<{ id: string; name: string; pageToken: string; igId: string }> = [];
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const u = new URL("https://graph.facebook.com/v23.0/me/accounts");
    u.searchParams.set("fields", "id,name,access_token,instagram_business_account");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("after", cursor);
    u.searchParams.set("access_token", userToken);
    const r = await fetch(u.toString());
    const b = (await r.json()) as {
      data?: Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }>;
      paging?: { cursors?: { after?: string } };
    };
    for (const p of b.data ?? []) {
      if (p.instagram_business_account?.id && p.access_token) {
        pagesWithIg.push({ id: p.id, name: p.name, pageToken: p.access_token, igId: p.instagram_business_account.id });
      }
    }
    if (!b.paging?.cursors?.after) break;
    cursor = b.paging.cursors.after;
  }
  console.log(`Found ${pagesWithIg.length} pages with linked IG`);
  for (const p of pagesWithIg) console.log(`  - ${p.name} (FB ${p.id} ↔ IG ${p.igId})`);

  // For each, look at recent 50 media for permalink match
  console.log(`\n→ Searching for shortcode "${SHORTCODE}" across all IG accounts...`);
  for (const p of pagesWithIg) {
    const u = new URL(`https://graph.facebook.com/v23.0/${p.igId}/media`);
    u.searchParams.set("fields", "id,permalink,caption,media_type");
    u.searchParams.set("limit", "50");
    u.searchParams.set("access_token", p.pageToken);
    const r = await fetch(u.toString());
    const b = (await r.json()) as {
      data?: Array<{ id: string; permalink: string; caption?: string }>;
      error?: { message: string };
    };
    if (b.error) {
      console.log(`  ${p.name}: API error ${b.error.message}`);
      continue;
    }
    const match = b.data?.find((m) => m.permalink.includes(`/${SHORTCODE}`));
    if (match) {
      console.log(`\n🎯 MATCH on ${p.name}`);
      console.log(`   FB Page: ${p.id}`);
      console.log(`   IG account: ${p.igId}`);
      console.log(`   IG media id: ${match.id}`);
      console.log(`   Permalink: ${match.permalink}`);
      console.log(`   Caption: ${(match.caption ?? "").slice(0, 200)}`);
      break;
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);

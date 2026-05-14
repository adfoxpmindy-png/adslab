/**
 * Try to find the REAL post_id for a Reel given its video_id from URL.
 *
 * Per memory: when boosting via Meta UI, Meta resolves video_id →
 * post_id internally. We need to find that resolution via public
 * Marketing API.
 *
 * Test target: EV Plaza reel
 *   URL video_id: 1015360974392298
 *   Expected real post_id: unknown (need to discover)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const PAGE_ID = "110409746982988";
const VIDEO_ID = "1015360974392298"; // from URL

async function fb(path: string, token: string) {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  return { status: res.status, body: await res.json() };
}

async function getPageToken(userToken: string): Promise<string> {
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
    url.searchParams.set("fields", "id,access_token");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    url.searchParams.set("access_token", userToken);
    const res = await fetch(url.toString());
    const body = (await res.json()) as {
      data?: Array<{ id: string; access_token?: string }>;
      paging?: { cursors?: { after?: string } };
    };
    const f = body.data?.find((p) => p.id === PAGE_ID);
    if (f?.access_token) return f.access_token;
    if (!body.paging?.cursors?.after) break;
    cursor = body.paging.cursors.after;
  }
  return "";
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);
  const pageToken = await getPageToken(userToken);
  console.log(`pageToken: ${pageToken ? "got" : "MISSING"}`);

  const attempts = [
    // A. video.feed_targeting / post_id
    `/${VIDEO_ID}?fields=id,post_id,story_id,event_link,permalink_url,from{id,name},content_category`,
    // B. video reels endpoint with post_id-like field
    `/${PAGE_ID}/video_reels?fields=id,post_id,permalink_url&limit=5`,
    // C. published_posts containing video
    `/${PAGE_ID}/published_posts?fields=id,attachments{target{id},type,subattachments}&limit=20`,
    // D. feed type=video
    `/${PAGE_ID}/feed?fields=id,attachments{target{id},type,media{source}}&limit=20`,
    // E. posts with full id
    `/${PAGE_ID}/posts?fields=id,attachments{target{id},type}&limit=20`,
    // F. video?fields=story_id
    `/${VIDEO_ID}?fields=id,permalink_url,published,status,custom_labels,event_link`,
  ];

  for (const path of attempts) {
    console.log(`\n━━━ ${path.slice(0, 80)} ━━━`);
    const r = await fb(path, pageToken || userToken);
    console.log(`  HTTP ${r.status}`);
    const trimmed = JSON.stringify(r.body, null, 2).slice(0, 600);
    console.log(`  ${trimmed}`);

    // If returned a feed/posts list, scan for items mentioning our video_id
    const body = r.body as { data?: Array<Record<string, unknown>> };
    if (body.data && Array.isArray(body.data)) {
      for (const item of body.data) {
        const json = JSON.stringify(item);
        if (json.includes(VIDEO_ID)) {
          console.log(`  ★ MATCH on video_id in item: ${json.slice(0, 300)}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

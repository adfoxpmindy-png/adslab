/**
 * For each of the 4 user reels, resolve video_id → real post_id via
 * the /PAGE_ID/video_reels endpoint with fields=id,post_id.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const PAGE_ID = "110409746982988";
const TARGET_VIDEO_IDS = [
  "1015360974392298",
  "2046794962859921",
  "1002568998876934",
  "994832796325634",
];

async function getPageToken(userToken: string): Promise<string> {
  const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
  url.searchParams.set("fields", "id,access_token");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", userToken);
  const res = await fetch(url.toString());
  const body = (await res.json()) as { data?: Array<{ id: string; access_token?: string }> };
  return body.data?.find((p) => p.id === PAGE_ID)?.access_token ?? "";
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);
  const pageToken = await getPageToken(userToken);

  // Paginate through all video_reels until we find every target
  const mapping = new Map<string, string>(); // video_id → post_id
  let next = `https://graph.facebook.com/v23.0/${PAGE_ID}/video_reels?fields=id,post_id&limit=100&access_token=${pageToken}`;
  let pages = 0;
  while (next && pages < 10) {
    const res = await fetch(next);
    const body = (await res.json()) as {
      data?: Array<{ id: string; post_id?: string }>;
      paging?: { next?: string };
    };
    for (const reel of body.data ?? []) {
      if (reel.post_id) mapping.set(reel.id, reel.post_id);
    }
    next = body.paging?.next ?? "";
    pages++;
    // Early-exit when we have all targets
    if (TARGET_VIDEO_IDS.every((v) => mapping.has(v))) break;
  }

  console.log(`\n━━━ Reel video_id → real post_id mapping ━━━`);
  for (const vid of TARGET_VIDEO_IDS) {
    const postId = mapping.get(vid);
    if (postId) {
      console.log(`  ✓ video=${vid} → post=${postId}`);
      console.log(`    → object_story_id = ${PAGE_ID}_${postId}`);
    } else {
      console.log(`  ✗ video=${vid} → NOT FOUND in ${pages} pages`);
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Look at existing CPS-named campaigns to learn:
 * 1. Exact naming pattern
 * 2. How FB-only vs IG-only platform filtering is done
 * 3. How IG ads are wired (instagram_actor_id, IG cross-post setup)
 *
 * Then fetch the 2 reel captions to derive title.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const FB_REEL_VIDEO_ID = "1459228105372710"; // from facebook.com/reel/1459228105372710
const IG_REEL_SHORTCODE = "DYURHCBA8NQ"; // from instagram.com/reel/DYURHCBA8NQ
const ACCOUNT = "act_1006870751067315"; // Digittribe (active, linked to many pages)

async function fb<T = unknown>(path: string, token: string): Promise<{ status: number; body: T }> {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  return { status: res.status, body: (await res.json()) as T };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  // 1. Find recent CPS campaigns (any account)
  console.log("━━━ 1. Recent CPS campaigns (study naming + structure) ━━━\n");
  const camps = await fb<{ data?: Array<{ id: string; name: string; objective?: string; account_id?: string }> }>(
    `/${ACCOUNT}/campaigns?fields=id,name,objective,account_id&filtering=[{"field":"name","operator":"CONTAIN","value":"CPS"}]&limit=20`,
    token,
  );
  const list = camps.body.data ?? [];
  console.log(`Found ${list.length} CPS campaigns on Digittribe`);
  for (const c of list.slice(0, 8)) {
    console.log(`  ${c.id} | ${c.name} | obj=${c.objective}`);
  }

  // 2. Inspect one of each platform variant to learn structure
  const fbExample = list.find((c) => c.name.includes("[FB]"));
  const igExample = list.find((c) => c.name.includes("[IG]"));
  if (fbExample) {
    console.log(`\n━━━ 2a. FB-only campaign structure: ${fbExample.name} ━━━`);
    const adsets = await fb<{ data?: Array<{ id: string; targeting?: { publisher_platforms?: string[]; facebook_positions?: string[]; instagram_positions?: string[] } }> }>(
      `/${fbExample.id}/adsets?fields=id,name,optimization_goal,targeting&limit=2`,
      token,
    );
    console.log(JSON.stringify(adsets.body, null, 2).slice(0, 800));

    const adsetId = adsets.body.data?.[0]?.id;
    if (adsetId) {
      const ads = await fb<{ data?: Array<{ id: string; creative?: { object_story_id?: string; instagram_actor_id?: string; video_id?: string } }> }>(
        `/${adsetId}/ads?fields=id,name,creative{id,object_story_id,instagram_actor_id,video_id,effective_object_story_id}&limit=2`,
        token,
      );
      console.log("\n  Creative shape:");
      console.log(JSON.stringify(ads.body, null, 2).slice(0, 800));
    }
  }
  if (igExample) {
    console.log(`\n━━━ 2b. IG-only campaign structure: ${igExample.name} ━━━`);
    const adsets = await fb<{ data?: Array<{ id: string; targeting?: { publisher_platforms?: string[]; instagram_positions?: string[] } }> }>(
      `/${igExample.id}/adsets?fields=id,name,optimization_goal,targeting&limit=2`,
      token,
    );
    console.log(JSON.stringify(adsets.body, null, 2).slice(0, 800));

    const adsetId = adsets.body.data?.[0]?.id;
    if (adsetId) {
      const ads = await fb<{ data?: Array<{ id: string; creative?: Record<string, unknown> }> }>(
        `/${adsetId}/ads?fields=id,name,creative{id,object_story_id,instagram_actor_id,video_id,effective_object_story_id,object_story_spec}&limit=2`,
        token,
      );
      console.log("\n  Creative shape:");
      console.log(JSON.stringify(ads.body, null, 2).slice(0, 1200));
    }
  }

  // 3. Resolve FB reel
  console.log(`\n━━━ 3. FB reel ${FB_REEL_VIDEO_ID} info ━━━`);
  const fbReel = await fb<{ id?: string; from?: { id: string; name: string }; description?: string; title?: string; created_time?: string; error?: { message: string } }>(
    `/${FB_REEL_VIDEO_ID}?fields=id,from{id,name},description,title,created_time`,
    token,
  );
  console.log(JSON.stringify(fbReel.body, null, 2));

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

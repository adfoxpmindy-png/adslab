/**
 * Study what a working "Boost Post" / "Boost Video" campaign looks like
 * (the ones the founder created via Meta UI that are working). The
 * structure of creative + ad fields will tell us what Marketing API
 * shape we should mimic.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const ACCOUNT = "act_1006870751067315"; // Digittribe

async function fb(path: string, token: string) {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  return { status: res.status, body: await res.json() };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  // Find any campaign on Digittribe with name starting "EV0526" or "Boost"
  const camps = await fb(
    `/${ACCOUNT}/campaigns?fields=id,name,objective&filtering=[{"field":"name","operator":"CONTAIN","value":"Boost"}]&limit=10`,
    token,
  );
  const list = (camps.body as { data?: Array<{ id: string; name: string; objective?: string }> }).data ?? [];
  console.log(`Found ${list.length} Boost-named campaigns`);
  for (const c of list.slice(0, 3)) console.log(`  ${c.id} ${c.name} objective=${c.objective}`);

  if (list.length === 0) {
    console.log("No working boost campaigns to study. Trying any active campaign...");
    const active = await fb(
      `/${ACCOUNT}/campaigns?fields=id,name,objective&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&limit=10`,
      token,
    );
    const activeList = (active.body as { data?: Array<{ id: string; name: string; objective?: string }> }).data ?? [];
    console.log(`Found ${activeList.length} active campaigns`);
    for (const c of activeList.slice(0, 3)) console.log(`  ${c.id} ${c.name} objective=${c.objective}`);
    if (activeList.length > 0) list.push(...activeList);
  }

  // Inspect first one's structure
  const target = list[0];
  if (!target) {
    console.log("Nothing to inspect");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n━━━ Inspecting: ${target.name} ━━━\n`);

  const adsets = await fb(`/${target.id}/adsets?fields=id,name&limit=5`, token);
  const adsetList = (adsets.body as { data?: Array<{ id: string; name: string }> }).data ?? [];
  if (adsetList.length === 0) {
    console.log("No adsets");
    await prisma.$disconnect();
    return;
  }

  for (const adset of adsetList.slice(0, 1)) {
    const ads = await fb(
      `/${adset.id}/ads?fields=id,name,creative{id,object_type,object_id,object_story_id,object_story_spec,effective_object_story_id,video_id,asset_feed_spec,product_set_id,thumbnail_url,call_to_action_type,name}&limit=3`,
      token,
    );
    console.log(JSON.stringify(ads.body, null, 2));
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

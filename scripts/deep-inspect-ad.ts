/**
 * Deep-inspect one ad — check creative, review_feedback, issues_info,
 * and try to understand why Meta UI shows "no ads" despite API returning them.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const AD_IDS = [
  "120248165245440166",
  "120248164478030166",
];

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

  for (const adId of AD_IDS) {
    console.log(`\n━━━ Ad ${adId} ━━━`);
    const r = await fb(
      `/${adId}?fields=id,name,status,configured_status,effective_status,issues_info,recommendations,bid_amount,adset{id,name,effective_status},creative{id,name,thumbnail_url,object_story_id,effective_object_story_id,status,video_id,image_url,call_to_action_type}`,
      token,
    );
    console.log(`status: ${r.status}`);
    console.log(JSON.stringify(r.body, null, 2));
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

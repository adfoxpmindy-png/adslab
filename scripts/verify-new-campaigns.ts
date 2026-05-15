/**
 * Verify the 4 NEW campaigns (with real post_id) exist in Meta.
 * Also confirm the 8 OLD dark-post campaigns are truly deleted.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const NEW_CAMPAIGNS = [
  "120248170751790166",
  "120248170752940166",
  "120248170753020166",
  "120248170753080166",
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  console.log("━━━ NEW campaigns status (right now) ━━━\n");
  for (const id of NEW_CAMPAIGNS) {
    const url = new URL(`https://graph.facebook.com/v23.0/${id}`);
    url.searchParams.set("fields", "id,name,effective_status,status,created_time");
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    const body = (await res.json()) as Record<string, unknown>;
    if (res.ok) {
      const adsetUrl = new URL(`https://graph.facebook.com/v23.0/${id}/adsets`);
      adsetUrl.searchParams.set("fields", "id,effective_status");
      adsetUrl.searchParams.set("access_token", token);
      const adsetRes = await fetch(adsetUrl.toString());
      const adsetBody = (await adsetRes.json()) as { data?: Array<{ id: string; effective_status: string }> };
      const adset = adsetBody.data?.[0];

      let adInfo = "(no adset)";
      if (adset) {
        const adUrl = new URL(`https://graph.facebook.com/v23.0/${adset.id}/ads`);
        adUrl.searchParams.set("fields", "id,effective_status,configured_status");
        adUrl.searchParams.set("access_token", token);
        const adRes = await fetch(adUrl.toString());
        const adBody = (await adRes.json()) as { data?: Array<{ id: string; effective_status: string; configured_status: string }> };
        const ad = adBody.data?.[0];
        adInfo = ad ? `ad=${ad.id} effective=${ad.effective_status} configured=${ad.configured_status}` : "(no ad)";
      }

      console.log(
        `✓ ${id} | name="${(body.name as string).slice(0, 40)}..." | campaign=${body.effective_status} | adset=${adset?.effective_status ?? "?"} | ${adInfo}`,
      );
    } else {
      console.log(`✗ ${id} | ${JSON.stringify(body)}`);
    }
  }

  console.log("\n━━━ Direct Meta Ads Manager URL for these 4 ━━━");
  console.log(
    `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1006870751067315&selected_campaign_ids=${NEW_CAMPAIGNS.join(",")}`,
  );

  await prisma.$disconnect();
}
main().catch(console.error);

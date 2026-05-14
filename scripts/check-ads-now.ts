/**
 * Check the current state of the 4 boost ads.
 * Looking for: rejected ads, deleted creatives, or other state changes.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CAMPAIGNS = [
  // Run 1 (15:57)
  { id: "120248164468520166", name: "Run1-A" },
  { id: "120248164469040166", name: "Run1-B" },
  { id: "120248164469150166", name: "Run1-C" },
  { id: "120248164469390166", name: "Run1-D" },
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

  for (const c of CAMPAIGNS) {
    console.log(`\n━━━ ${c.name} (campaign ${c.id}) ━━━`);
    const adsets = await fb(`/${c.id}/adsets?fields=id,name,effective_status`, token);
    const adsetList = (adsets.body as { data?: Array<{ id: string; effective_status: string }> }).data ?? [];
    for (const adset of adsetList) {
      console.log(`  AdSet ${adset.id}: ${adset.effective_status}`);
      // No filter — get ALL ads including deleted/archived
      const ads = await fb(
        `/${adset.id}/ads?fields=id,name,status,configured_status,effective_status,review_feedback,issues_info&limit=50`,
        token,
      );
      const adList = (ads.body as { data?: Array<Record<string, unknown>> }).data ?? [];
      console.log(`    Ads (unfiltered): ${adList.length}`);
      for (const ad of adList) {
        console.log(`      - ${ad.id}: configured=${ad.configured_status} effective=${ad.effective_status}`);
        if (ad.review_feedback) console.log(`        review: ${JSON.stringify(ad.review_feedback)}`);
        if (ad.issues_info) console.log(`        issues: ${JSON.stringify(ad.issues_info)}`);
      }
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

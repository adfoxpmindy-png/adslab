/**
 * Query Meta directly for each of the 4 campaigns just created,
 * confirm that AdSet + Ad + Creative tree exists underneath.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CAMPAIGN_IDS = [
  "120248165236170166",
  "120248165237250166",
  "120248165236980166",
  "120248165237280166",
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

  for (const id of CAMPAIGN_IDS) {
    console.log(`\n━━━ Campaign ${id} ━━━`);
    const camp = await fb(
      `/${id}?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget`,
      token,
    );
    console.log(`  status: ${camp.status}`);
    console.log(`  body: ${JSON.stringify(camp.body, null, 2).slice(0, 400)}`);

    const adsets = await fb(`/${id}/adsets?fields=id,name,status,daily_budget,optimization_goal,targeting`, token);
    const adsetList = (adsets.body as { data?: Array<{ id: string; name: string; status: string; optimization_goal?: string }> }).data ?? [];
    console.log(`  AdSets: ${adsetList.length}`);
    for (const a of adsetList) {
      console.log(`    - ${a.id} "${a.name}" status=${a.status} opt=${a.optimization_goal}`);
      const ads = await fb(`/${a.id}/ads?fields=id,name,status,creative`, token);
      const adList = (ads.body as { data?: Array<{ id: string; name: string; status: string }> }).data ?? [];
      console.log(`      Ads under: ${adList.length}`);
      for (const ad of adList) {
        console.log(`        - ${ad.id} "${ad.name}" status=${ad.status}`);
      }
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

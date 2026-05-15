import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const conn = await prisma.metaConnection.findFirstOrThrow({ where: { tenant: { slug: "demo" } } });
  const token = decrypt(conn.accessTokenEncrypted);

  const allEvPlaza = await prisma.metaCampaign.findMany({
    where: {
      metaConnectionId: conn.id,
      name: { contains: "EV Plaza" },
    },
    orderBy: { lastFetchedAt: "desc" },
    select: {
      id: true,
      metaCampaignId: true,
      metaAccountId: true,
      name: true,
      effectiveStatus: true,
      adSets: {
        select: {
          id: true,
          metaAdSetId: true,
          name: true,
          effectiveStatus: true,
          ads: {
            select: { id: true, metaAdId: true, effectiveStatus: true },
          },
        },
      },
    },
  });

  console.log(`Found ${allEvPlaza.length} EV Plaza campaigns in DB:\n`);
  for (const c of allEvPlaza) {
    const totalAds = c.adSets.reduce((s, a) => s + a.ads.length, 0);
    console.log(`${c.metaCampaignId} | acct=${c.metaAccountId} | ${c.effectiveStatus} | DB: ${c.adSets.length} adsets, ${totalAds} ads`);
    console.log(`  name: ${c.name}`);

    // Cross-check with Meta
    const r = await fetch(
      `https://graph.facebook.com/v23.0/${c.metaCampaignId}/adsets?fields=id,ads.limit(20){id,effective_status}&access_token=${token}`,
    );
    const b = (await r.json()) as { data?: Array<{ id: string; ads?: { data?: Array<{ id: string; effective_status: string }> } }>; error?: { message: string } };
    if (b.error) {
      console.log(`  Meta: ERR ${b.error.message}`);
    } else {
      const metaAdsets = b.data ?? [];
      const metaTotalAds = metaAdsets.reduce((s, a) => s + (a.ads?.data?.length ?? 0), 0);
      console.log(`  Meta: ${metaAdsets.length} adsets, ${metaTotalAds} ads`);
    }
    console.log();
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

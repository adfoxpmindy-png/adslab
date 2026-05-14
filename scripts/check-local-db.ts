import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const META_CAMPAIGN_IDS = [
  "120248165236170166",
  "120248165237250166",
  "120248165236980166",
  "120248165237280166",
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  for (const mid of META_CAMPAIGN_IDS) {
    const camp = await prisma.metaCampaign.findFirst({
      where: { metaCampaignId: mid },
      select: {
        id: true,
        metaCampaignId: true,
        name: true,
        effectiveStatus: true,
        adSets: { select: { id: true, name: true, metaAdSetId: true, ads: { select: { id: true, name: true } } } },
      },
    });
    console.log(`\n${mid}: ${camp ? "FOUND" : "MISSING"}`);
    if (camp) {
      console.log(`  name: ${camp.name}`);
      console.log(`  status: ${camp.effectiveStatus}`);
      console.log(`  adsets in DB: ${camp.adSets.length}`);
      for (const a of camp.adSets) {
        console.log(`    - ${a.name} (meta:${a.metaAdSetId}) | ads: ${a.ads.length}`);
      }
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);

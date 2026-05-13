/**
 * Idempotent plan seeder. Run with `npm run seed:plans`. Safe to run
 * multiple times — uses upsert on the unique `key` column.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

import { PLANS } from "../../src/lib/billing/plans";

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  let upserted = 0;
  for (const def of PLANS) {
    await prisma.plan.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        name: def.name,
        priceMonthly: def.priceMonthly,
        priceYearly: def.priceYearly,
        spendCeilingThb: def.spendCeilingThb,
        adAccountLimit: def.adAccountLimit,
        aiMsgPerDay: def.aiMsgPerDay,
        isAddOn: def.isAddOn,
      },
      update: {
        name: def.name,
        priceMonthly: def.priceMonthly,
        priceYearly: def.priceYearly,
        spendCeilingThb: def.spendCeilingThb,
        adAccountLimit: def.adAccountLimit,
        aiMsgPerDay: def.aiMsgPerDay,
        isAddOn: def.isAddOn,
        active: true,
      },
    });
    upserted++;
  }

  console.log(`✓ Seeded ${upserted} plan rows`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

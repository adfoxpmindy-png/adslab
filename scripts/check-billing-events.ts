/**
 * Quick query: recent BillingEvents on prod. Use to verify webhook
 * deliveries are landing after triggering a test from Omise dashboard.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  const recentAll = await prisma.billingEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { tenant: { select: { slug: true } } },
  });

  console.log(`\nMost recent ${recentAll.length} BillingEvents:`);
  if (recentAll.length === 0) {
    console.log("  (none)");
  }
  for (const e of recentAll) {
    const isWebhook = !!e.idempotencyKey;
    console.log(
      `  ${e.createdAt.toISOString()}  ${e.kind.padEnd(20)} ${e.tenant.slug.padEnd(20)} ${isWebhook ? "[webhook " + e.idempotencyKey + "]" : "[local]"}`,
    );
  }

  const webhookOnly = recentAll.filter((e) => e.idempotencyKey);
  console.log(`\nWebhook-driven (with Omise event ID): ${webhookOnly.length} of last 10`);

  await prisma.$disconnect();
}

main().catch(console.error);

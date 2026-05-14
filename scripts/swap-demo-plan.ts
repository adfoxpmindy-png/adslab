/**
 * Temporarily swap the demo tenant's plan to verify UI variants that
 * are plan-gated (e.g. the upgrade card). Usage:
 *   npx tsx scripts/swap-demo-plan.ts starter  # for screenshots
 *   npx tsx scripts/swap-demo-plan.ts scale    # restore default
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const targetKey = process.argv[2];
  if (!targetKey) {
    console.error("usage: tsx scripts/swap-demo-plan.ts <plan-key>");
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const plan = await prisma.plan.findUnique({ where: { key: targetKey } });
  if (!plan) {
    console.error(`plan not found: ${targetKey}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "demo" },
    include: { subscription: true },
  });
  await prisma.tenantSubscription.update({
    where: { id: tenant.subscription!.id },
    data: { planId: plan.id },
  });
  console.log(`✓ demo tenant plan → ${plan.key} (${plan.name})`);
  await prisma.$disconnect();
}
main().catch(console.error);

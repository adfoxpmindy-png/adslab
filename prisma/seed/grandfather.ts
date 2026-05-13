/**
 * Grandfather seeder: gives every existing tenant a Subscription so
 * Phase 9 deploy doesn't lock anyone out. Existing tenants get a
 * "Scale" plan with no Omise card and far-future currentPeriodEnd.
 *
 * Run once on prod immediately after deploying Phase 9 schema.
 *
 *   npm run seed:grandfather
 *
 * Idempotent — re-running skips tenants that already have a sub.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  const scalePlan = await prisma.plan.findUnique({ where: { key: "scale" } });
  if (!scalePlan) {
    console.error("✗ Scale plan not found — run `npm run seed:plans` first");
    process.exit(1);
  }

  const tenants = await prisma.tenant.findMany({
    where: { subscription: null },
    select: { id: true, slug: true, name: true },
  });

  console.log(`Found ${tenants.length} tenant(s) without subscription`);

  const farFuture = new Date(Date.now() + 365 * 10 * 24 * 3600 * 1000);
  let granted = 0;
  for (const t of tenants) {
    await prisma.tenantSubscription.create({
      data: {
        tenantId: t.id,
        planId: scalePlan.id,
        status: "ACTIVE",
        interval: "MONTHLY",
        trialEndsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: farFuture,
        addOnKeys: ["event-sdk", "white-label", "priority-ai"],
      },
    });
    await prisma.billingEvent.create({
      data: {
        tenantId: t.id,
        kind: "TRIAL_STARTED",
        payload: { grandfathered: true, reason: "phase-9-deploy" },
      },
    });
    console.log(`  ✓ ${t.slug} — ${t.name}`);
    granted++;
  }

  console.log(`Granted Scale-tier subscription to ${granted} tenant(s)`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

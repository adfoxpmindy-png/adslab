/**
 * Test webhook delivery end-to-end: create a real Omise test charge
 * with our test tenant's metadata → Omise fires charge.complete →
 * delivers to https://adslab-theta.vercel.app/api/billing/webhook →
 * our handler inserts a BillingEvent row.
 *
 * Verifies the webhook secret in Vercel matches what Omise dashboard
 * has. If signature verification fails, no row gets inserted.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  // Find a real tenant to attach metadata to.
  const tenant = await prisma.tenant.findUnique({ where: { slug: "adstfl" } });
  if (!tenant) throw new Error("adstfl tenant not found");
  console.log(`Using tenant: ${tenant.slug} (id=${tenant.id})`);

  // Count current webhook-driven events for this tenant (baseline).
  const before = await prisma.billingEvent.count({
    where: { tenantId: tenant.id, idempotencyKey: { not: null } },
  });
  console.log(`BillingEvents with idempotencyKey for this tenant before: ${before}`);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const omiseLib = require("omise");
  const omise = omiseLib({
    secretKey: process.env.OMISE_SECRET_KEY,
    publicKey: process.env.OMISE_PUBLIC_KEY,
  });

  // Tokenize a fresh card.
  console.log("\nStep 1: tokenize test card 4242");
  const token = await omise.tokens.create({
    card: {
      name: "Webhook E2E Test",
      number: "4242424242424242",
      expiration_month: 12,
      expiration_year: 2030,
      security_code: "123",
    },
  });
  console.log(`  Token: ${token.id}`);

  // Create a one-time charge (no customer needed).
  console.log("\nStep 2: create charge with tenantId metadata");
  const charge = await omise.charges.create({
    amount: 14900, // ฿149 — small test charge
    currency: "thb",
    card: token.id,
    description: "Webhook delivery test",
    metadata: { tenantId: tenant.id },
  });
  console.log(`  Charge: ${charge.id} status=${charge.status}`);

  // Insert a matching Invoice so the refund handler has something to
  // mark as REFUNDED. Also gives us a target for tenant FK.
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      omiseChargeId: charge.id,
      amount: 149,
      status: "PAID",
      paidAt: new Date(),
      billingPeriodStart: new Date(),
      billingPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      lineItems: { test: true },
    },
  });

  // Now refund the charge — this fires refund.create which our handler
  // DOES act on (charge.complete only fires for 3DS cards, so we use
  // refund.create as the actionable event for this end-to-end test).
  console.log("\nStep 2b: create refund (fires refund.create webhook)");
  const refund = await omise.charges.createRefund(charge.id, {
    amount: 14900,
    metadata: { tenantId: tenant.id, invoiceTest: true },
  });
  console.log(`  Refund: ${refund.id}`);

  // Omise should now deliver a charge.complete event to our webhook
  // endpoint. Poll our DB for up to 60s waiting for the BillingEvent row.
  console.log("\nStep 3: poll DB for webhook delivery (up to 60s)");
  const deadline = Date.now() + 60_000;
  let after = before;
  let lastCheck = Date.now();
  while (Date.now() < deadline) {
    after = await prisma.billingEvent.count({
      where: { tenantId: tenant.id, idempotencyKey: { not: null } },
    });
    if (after > before) break;
    // Heartbeat every 5s
    if (Date.now() - lastCheck > 5000) {
      const elapsed = Math.round((Date.now() - (deadline - 60_000)) / 1000);
      process.stdout.write(`  …${elapsed}s elapsed\n`);
      lastCheck = Date.now();
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nBillingEvents after: ${after}`);

  if (after > before) {
    console.log(`\n✓ Webhook delivered + signature verified + row inserted (${after - before} new)`);
    // Show the new event
    const newest = await prisma.billingEvent.findFirst({
      where: { tenantId: tenant.id, idempotencyKey: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    console.log(`  id: ${newest?.idempotencyKey}`);
    console.log(`  kind: ${newest?.kind}`);
    console.log(`  at: ${newest?.createdAt.toISOString()}`);
  } else {
    console.log(`\n✗ No BillingEvent appeared. Possible causes:`);
    console.log(`  1. Webhook secret in Vercel does not match Omise dashboard`);
    console.log(`     → signature verification fails → 400 returned → no DB write`);
    console.log(`  2. Webhook in Omise dashboard is disabled or wrong URL`);
    console.log(`  3. Omise didn't trigger charge.complete (only fires for 3DS — non-3DS skips it)`);

    // Check the Omise event itself
    console.log(`\n  Querying Omise events to see if charge fired a webhook delivery attempt...`);
    const eventList = await omise.events.list({ limit: 5 });
    const relevant = eventList.data.filter((e: { data?: { id?: string } }) =>
      e.data?.id === charge.id,
    );
    for (const e of relevant) {
      console.log(`    Omise event ${e.id} key=${e.key} deliveries=${e.webhook_deliveries?.length ?? 0}`);
      for (const d of e.webhook_deliveries ?? []) {
        console.log(`      delivery → status=${d.status} attempts=${d.attempt_count}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

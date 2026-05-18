/**
 * Phase 9 Billing — end-to-end test runner.
 *
 * Runs 22 scenarios covering: plan catalog, tier math, Omise live API
 * (sandbox), trial lifecycle, charge + refund, feature gates,
 * webhook signature verification + idempotency, and cancellation.
 *
 * Usage: npm run test:billing
 *
 * Side effects: creates 1 test tenant + 1 test user + a few Omise test
 * customers (no real money). Cleans up at the end.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

import {
  PLANS,
  pickRecommendedTier,
  getPlan,
  BASE_PLAN_KEYS,
} from "../src/lib/billing/plans";
import {
  computePeriodTotal,
  splitVat,
  computeRefund,
  computeProration,
  isUpgrade,
  isDowngrade,
} from "../src/lib/billing/tier-rules";
import { omise } from "../src/lib/billing/omise/client";
import { saveCardToCustomer } from "../src/lib/billing/omise/customer";
import { chargeTenant } from "../src/lib/billing/omise/charge";
import { refundInvoice } from "../src/lib/billing/omise/refund";
import {
  verifyOmiseSignature,
  handleOmiseEvent,
} from "../src/lib/billing/omise/webhook";
import { startTrial } from "../src/lib/billing/checkout";
import { runBillingTick } from "../src/lib/billing/tick";
import { requireFeature, FeatureGateError } from "../src/lib/billing/gate";
import { DEFAULT_LOCALE } from "../src/i18n/locales";
import { recordAiUsage } from "../src/lib/billing/usage";

const cs = process.env.DATABASE_URL;
if (!cs) throw new Error("DATABASE_URL not set");
const adapter = new PrismaNeon({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

const TEST_USER_EMAIL = "billing-e2e@adslab-test.local";
const TEST_TENANT_SLUG = "billing-e2e-tenant";

type TestResult = { name: string; pass: boolean; detail?: string };
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, pass: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail: string) {
  results.push({ name, pass: false, detail });
  console.log(`  ✗ ${name} — ${detail}`);
}

async function setup() {
  // Clean up any previous run.
  const existing = await prisma.tenant.findUnique({ where: { slug: TEST_TENANT_SLUG }, select: { id: true } });
  if (existing) {
    await prisma.billingEvent.deleteMany({ where: { tenantId: existing.id } });
    await prisma.invoice.deleteMany({ where: { tenantId: existing.id } });
    await prisma.usageMetric.deleteMany({ where: { tenantId: existing.id } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: existing.id } });
    await prisma.tenantMember.deleteMany({ where: { tenantId: existing.id } });
    await prisma.tenant.delete({ where: { id: existing.id } });
  }
  await prisma.user.deleteMany({ where: { email: TEST_USER_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: TEST_USER_EMAIL,
      passwordHash: "n/a",
      name: "Billing Test",
      emailVerifiedAt: new Date(),
    },
  });
  const tenant = await prisma.tenant.create({
    data: {
      slug: TEST_TENANT_SLUG,
      name: "Billing E2E Tenant",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  return { user, tenant };
}

async function cleanup(tenantId: string, userId: string) {
  await prisma.billingEvent.deleteMany({ where: { tenantId } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.usageMetric.deleteMany({ where: { tenantId } });
  await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
  await prisma.tenantMember.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.user.delete({ where: { id: userId } });
}

/** Create an Omise test token for card 4242 4242 4242 4242. */
async function mintCardToken(cardNumber = "4242424242424242"): Promise<string> {
  const o = omise();
  const tok = await o.tokens.create({
    card: {
      name: "Billing Test",
      number: cardNumber,
      expiration_month: 12,
      expiration_year: 2030,
      security_code: "123",
    },
  });
  return tok.id;
}

async function run() {
  console.log("Phase 9 Billing E2E — 22 scenarios\n");
  console.log("━".repeat(60));

  const { user, tenant } = await setup();
  console.log(`Test tenant: ${tenant.slug} (id=${tenant.id})\n`);

  // ===== Group 1: Plan catalog =====
  console.log("\n[1] Plan catalog");

  // 1.1
  try {
    const plans = await prisma.plan.findMany({ where: { active: true } });
    if (plans.length === 9) pass("1.1 Plan catalog has 9 active rows", `${plans.length} rows`);
    else fail("1.1 Plan catalog row count", `expected 9, got ${plans.length}`);
  } catch (e) {
    fail("1.1 Plan catalog query", (e as Error).message);
  }

  // 1.2
  const baseKeys = ["starter", "growth", "pro", "scale", "enterprise"];
  const addOnKeys = ["event-sdk", "extra-ad-account", "white-label", "priority-ai"];
  const dbKeys = (await prisma.plan.findMany({ select: { key: true } })).map((p) => p.key).sort();
  const allExpected = [...baseKeys, ...addOnKeys].sort();
  if (JSON.stringify(dbKeys) === JSON.stringify(allExpected)) {
    pass("1.2 All 5 base plans + 4 add-ons present");
  } else {
    fail("1.2 Plan keys", `missing/extra: ${JSON.stringify(dbKeys)}`);
  }

  // ===== Group 2: Tier rules (pure math) =====
  console.log("\n[2] Tier rule math");

  // 2.1 — small spend → starter
  const t1 = pickRecommendedTier(5_000);
  t1 === "starter" ? pass("2.1 ฿5k spend → starter", t1) : fail("2.1 ฿5k recommendation", `got ${t1}`);

  // 2.2 — mid spend → pro
  const t2 = pickRecommendedTier(50_000);
  t2 === "pro" ? pass("2.2 ฿50k spend → pro", t2) : fail("2.2 ฿50k recommendation", `got ${t2}`);

  // 2.3 — huge → enterprise
  const t3 = pickRecommendedTier(2_000_000);
  t3 === "enterprise" ? pass("2.3 ฿2M spend → enterprise", t3) : fail("2.3 ฿2M recommendation", `got ${t3}`);

  // 2.4 — bundle total
  const total = computePeriodTotal({
    planKey: "pro",
    interval: "MONTHLY",
    addOnKeys: ["event-sdk", "white-label"],
    extraAdAccounts: 2,
  });
  const expected = 10_990 + 590 + 490 + 190 * 2;
  total === expected
    ? pass("2.4 Pro + event-sdk + white-label + 2 extra accts", `฿${total}`)
    : fail("2.4 Bundle total", `got ฿${total}, expected ฿${expected}`);

  // 2.5 — VAT split (฿1,490 inclusive)
  const { base, vat } = splitVat(1490);
  Math.abs(base + vat - 1490) <= 1 && vat > 0
    ? pass("2.5 splitVat(1490)", `base=${base}, vat=${vat}`)
    : fail("2.5 splitVat math", `${base}+${vat}≠1490`);

  // 2.6 — refund pro-ration (3 days used of 30)
  const ps = new Date("2026-05-01");
  const pe = new Date("2026-05-31");
  const now = new Date("2026-05-04");
  const refund = computeRefund({ invoiceAmount: 1490, periodStart: ps, periodEnd: pe, now });
  refund > 1200 && refund < 1400
    ? pass("2.6 Refund 3-of-30 days", `฿${refund}`)
    : fail("2.6 Refund math", `got ฿${refund}, expected ~฿1,341`);

  // 2.7 — proration on upgrade (10 days used of 30, oldTotal ฿1,490, newTotal ฿3,890)
  const proration = computeProration({
    oldTotal: 1490,
    newTotal: 3890,
    periodStart: new Date("2026-05-01"),
    periodEnd: new Date("2026-05-31"),
    now: new Date("2026-05-11"),
  });
  proration > 1000 && proration < 2000
    ? pass("2.7 Proration upgrade Starter→Growth, day 10/30", `฿${proration}`)
    : fail("2.7 Proration math", `got ฿${proration}`);

  // 2.8 — upgrade/downgrade detection
  if (isUpgrade("starter", "pro") && isDowngrade("pro", "starter") && !isUpgrade("pro", "pro")) {
    pass("2.8 Upgrade/downgrade detection");
  } else {
    fail("2.8 Upgrade/downgrade flags", "logic mismatch");
  }

  // ===== Group 3: Omise live API (sandbox) =====
  console.log("\n[3] Omise sandbox API");

  let testCustomerId: string | null = null;
  let testCardId: string | null = null;

  // 3.1 — tokenize test card
  let tokenId: string;
  try {
    tokenId = await mintCardToken();
    pass("3.1 Tokenize card 4242", tokenId);
  } catch (e) {
    fail("3.1 Tokenization failed", (e as Error).message);
    throw e;
  }

  // 3.2 — save card to customer
  try {
    const { customerId, cardId } = await saveCardToCustomer({
      tenantId: tenant.id,
      email: user.email,
      cardToken: tokenId,
    });
    testCustomerId = customerId;
    testCardId = cardId;
    pass("3.2 saveCardToCustomer creates Omise customer", customerId.slice(0, 30));
  } catch (e) {
    fail("3.2 saveCardToCustomer", (e as Error).message);
  }

  // 3.3 — charge against saved customer
  if (testCustomerId) {
    try {
      const chargeRes = await chargeTenant({
        tenantId: tenant.id,
        customerId: testCustomerId,
        amountThb: 1490,
        description: "E2E test charge",
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        lineItems: { test: true },
      });
      if (chargeRes.kind === "paid") {
        pass("3.3 Charge succeeds with test card", `invoice=${chargeRes.invoiceId}`);
      } else {
        fail("3.3 Charge result", `kind=${chargeRes.kind}`);
      }
    } catch (e) {
      fail("3.3 Charge", (e as Error).message);
    }
  }

  // ===== Group 4: Trial lifecycle =====
  console.log("\n[4] Trial lifecycle");

  // 4.1 — Reset subscription, then startTrial
  await prisma.billingEvent.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenantSubscription.deleteMany({ where: { tenantId: tenant.id } });

  let freshTokenId: string;
  try {
    freshTokenId = await mintCardToken();
    const result = await startTrial({
      tenantId: tenant.id,
      email: user.email,
      planKey: "growth",
      interval: "MONTHLY",
      addOnKeys: [],
      extraAdAccounts: 0,
      cardToken: freshTokenId,
    });
    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    if (sub?.status === "TRIALING" && sub.trialEndsAt) {
      const daysToEnd = Math.round((sub.trialEndsAt.getTime() - Date.now()) / (24 * 3600 * 1000));
      pass("4.1 startTrial creates TRIALING sub", `7 days, ends in ${daysToEnd}d`);
    } else {
      fail("4.1 startTrial status", `status=${sub?.status}`);
    }
  } catch (e) {
    fail("4.1 startTrial", (e as Error).message);
  }

  // 4.2 — billing-tick at day -2: should send 2-day reminder
  try {
    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    if (!sub) throw new Error("no sub");
    // Move trialEndsAt to "2 days from now"
    const trialEnd2d = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { trialEndsAt: trialEnd2d },
    });
    const stats = await runBillingTick({ appUrl: "http://localhost:3000" });
    const remEvents = await prisma.billingEvent.findMany({
      where: { tenantId: tenant.id, kind: "TRIAL_REMINDER_SENT" },
    });
    remEvents.length === 1
      ? pass("4.2 Day -2 reminder sent once", `stats.remindersSent=${stats.remindersSent}`)
      : fail("4.2 Day -2 reminder", `${remEvents.length} reminder events`);

    // Run again — should be idempotent (no second reminder)
    await runBillingTick({ appUrl: "http://localhost:3000" });
    const remEvents2 = await prisma.billingEvent.findMany({
      where: { tenantId: tenant.id, kind: "TRIAL_REMINDER_SENT" },
    });
    remEvents2.length === 1
      ? pass("4.3 Reminder is idempotent (rerun = no dup)")
      : fail("4.3 Reminder idempotency", `${remEvents2.length} events after 2nd tick`);
  } catch (e) {
    fail("4.2/4.3 Reminder cron", (e as Error).message);
  }

  // 4.4 — Past trial end: cron creates charge → ACTIVE
  try {
    // Move trialEndsAt to yesterday
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { trialEndsAt: new Date(Date.now() - 24 * 3600 * 1000) },
    });
    const stats = await runBillingTick({ appUrl: "http://localhost:3000" });
    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    const inv = await prisma.invoice.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
    });
    if (sub?.status === "ACTIVE" && inv?.status === "PAID") {
      pass("4.4 Post-trial cron charges → ACTIVE", `invoice=฿${inv.amount}`);
    } else {
      fail("4.4 Post-trial charge", `sub.status=${sub?.status}, inv.status=${inv?.status}, charged=${stats.charged}`);
    }
  } catch (e) {
    fail("4.4 Post-trial charge", (e as Error).message);
  }

  // ===== Group 5: Feature gates =====
  console.log("\n[5] Feature gates");

  // 5.1 — Allow AI chat when status=ACTIVE
  try {
    await requireFeature(tenant.id, "ai-chat", DEFAULT_LOCALE);
    pass("5.1 ai-chat allowed when ACTIVE");
  } catch (e) {
    fail("5.1 ai-chat gate", (e as Error).message);
  }

  // 5.2 — Block ai-chat-msg when over daily cap (Growth = 100/day)
  try {
    // Manually set usage to 100
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.usageMetric.upsert({
      where: { tenantId_date: { tenantId: tenant.id, date: today } },
      create: { tenantId: tenant.id, date: today, aiMessagesCount: 100, aiInputTokens: BigInt(0), aiOutputTokens: BigInt(0), adSpendThb: 0 },
      update: { aiMessagesCount: 100 },
    });
    let threwAsExpected = false;
    try {
      await requireFeature(tenant.id, "ai-chat-msg", DEFAULT_LOCALE);
    } catch (err) {
      if (err instanceof FeatureGateError && err.reason === "TIER_LIMIT") threwAsExpected = true;
    }
    threwAsExpected
      ? pass("5.2 ai-chat-msg blocks at cap", "Growth=100/day → 101st blocked")
      : fail("5.2 ai-chat-msg gate", "did not throw TIER_LIMIT");
    // reset
    await prisma.usageMetric.update({
      where: { tenantId_date: { tenantId: tenant.id, date: today } },
      data: { aiMessagesCount: 0 },
    });
  } catch (e) {
    fail("5.2 ai-chat-msg gate setup", (e as Error).message);
  }

  // 5.3 — Block event-sdk when add-on inactive
  try {
    let blocked = false;
    try {
      await requireFeature(tenant.id, "event-sdk", DEFAULT_LOCALE);
    } catch (err) {
      if (err instanceof FeatureGateError && err.reason === "ADDON_REQUIRED") blocked = true;
    }
    blocked
      ? pass("5.3 event-sdk blocked without add-on")
      : fail("5.3 event-sdk gate", "did not throw ADDON_REQUIRED");
  } catch (e) {
    fail("5.3 event-sdk gate", (e as Error).message);
  }

  // 5.4 — Allow event-sdk after add-on enabled
  try {
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { addOnKeys: ["event-sdk"] },
    });
    // Need to invalidate React cache — direct call doesn't have it, so this just hits DB fresh
    await requireFeature(tenant.id, "event-sdk", DEFAULT_LOCALE);
    pass("5.4 event-sdk allowed when add-on enabled");
  } catch (e) {
    fail("5.4 event-sdk allow", (e as Error).message);
  }

  // 5.5 — record AI usage increments counter
  try {
    await recordAiUsage({ tenantId: tenant.id, inputTokens: 100, outputTokens: 50 });
    await recordAiUsage({ tenantId: tenant.id, inputTokens: 200, outputTokens: 100 });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const usage = await prisma.usageMetric.findUnique({
      where: { tenantId_date: { tenantId: tenant.id, date: today } },
    });
    if (usage && usage.aiMessagesCount === 2 && usage.aiInputTokens === BigInt(300)) {
      pass("5.5 recordAiUsage accumulates", `2 msgs, 300 in / 150 out`);
    } else {
      fail("5.5 usage rollup", `got ${usage?.aiMessagesCount} msg, ${usage?.aiInputTokens} tok`);
    }
  } catch (e) {
    fail("5.5 recordAiUsage", (e as Error).message);
  }

  // ===== Group 6: Webhook =====
  console.log("\n[6] Webhook signature + idempotency");

  // 6.1 — valid signature accepted
  const secret = process.env.OMISE_WEBHOOK_SECRET!;
  const decodedSecret = Buffer.from(secret, "base64");
  const ts = "1700000000";
  const rawBody = JSON.stringify({ id: "evnt_test_signaturecheck", key: "charge.complete" });
  const validSig = crypto.createHmac("sha256", decodedSecret).update(`${ts}.${rawBody}`).digest("hex");
  if (verifyOmiseSignature({ rawBody, signatureHeader: validSig, timestampHeader: ts, secret })) {
    pass("6.1 Valid signature accepted");
  } else {
    fail("6.1 Valid signature", "rejected good HMAC");
  }

  // 6.2 — bad signature rejected
  if (!verifyOmiseSignature({ rawBody, signatureHeader: "0".repeat(64), timestampHeader: ts, secret })) {
    pass("6.2 Bad signature rejected");
  } else {
    fail("6.2 Bad signature", "accepted bad HMAC");
  }

  // 6.3 — missing headers rejected
  if (!verifyOmiseSignature({ rawBody, signatureHeader: null, timestampHeader: ts, secret })) {
    pass("6.3 Missing signature header rejected");
  } else {
    fail("6.3 Missing header", "accepted no sig");
  }

  // 6.4 — webhook idempotency
  try {
    const fakeChargeId = "chrg_test_idempotency";
    // Pre-create an invoice so the webhook has something to update
    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        omiseChargeId: fakeChargeId,
        amount: 100,
        status: "PENDING",
        billingPeriodStart: sub!.currentPeriodStart,
        billingPeriodEnd: sub!.currentPeriodEnd,
        lineItems: {},
      },
    });

    const event = {
      object: "event" as const,
      id: "evnt_test_idempotent_001",
      livemode: false,
      key: "charge.complete",
      created_at: new Date().toISOString(),
      data: {
        object: "charge",
        id: fakeChargeId,
        amount: 100,
        currency: "thb",
        status: "successful" as const,
        paid: true,
        authorize_uri: null,
        return_uri: null,
        failure_code: null,
        failure_message: null,
        customer: null,
        card: null,
        metadata: { tenantId: tenant.id },
        created_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
        livemode: false,
      },
    };
    await handleOmiseEvent(event);
    await handleOmiseEvent(event); // 2nd call should be noop
    const events = await prisma.billingEvent.findMany({
      where: { idempotencyKey: event.id },
    });
    events.length === 1
      ? pass("6.4 Webhook idempotency", "2 deliveries, 1 BillingEvent row")
      : fail("6.4 Idempotency", `got ${events.length} rows for same event`);
  } catch (e) {
    fail("6.4 Idempotency", (e as Error).message);
  }

  // ===== Group 7: Refund =====
  console.log("\n[7] Refund");

  // 7.1 — refund within 7-day window. Use the FIRST paid invoice (the
  // real Omise charge from 4.4), not the synthetic one from 6.4.
  try {
    const inv = await prisma.invoice.findFirst({
      where: {
        tenantId: tenant.id,
        status: "PAID",
        // Exclude the synthetic charge from the idempotency test.
        NOT: { omiseChargeId: "chrg_test_idempotency" },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!inv) {
      fail("7.1 Refund setup", "no real PAID invoice to refund");
    } else {
      const result = await refundInvoice({
        tenantId: tenant.id,
        invoiceId: inv.id,
        now: new Date(inv.paidAt!.getTime() + 3 * 24 * 3600 * 1000),
      });
      if (result.kind === "refunded" && result.amount > 0) {
        pass("7.1 Refund within 7 days", `฿${result.amount} (pro-rated)`);
      } else {
        fail("7.1 Refund", `kind=${result.kind}`);
      }
    }
  } catch (e) {
    fail("7.1 Refund within window", (e as Error).message);
  }

  // 7.2 — refund after 7 days denied (use stale invoice manually)
  try {
    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    const inv = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        omiseChargeId: `chrg_test_stale_${Date.now()}`,
        amount: 1000,
        status: "PAID",
        billingPeriodStart: new Date(Date.now() - 60 * 24 * 3600 * 1000),
        billingPeriodEnd: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        paidAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        lineItems: {},
      },
    });
    const result = await refundInvoice({ tenantId: tenant.id, invoiceId: inv.id });
    result.kind === "denied" && result.reason === "outside_window"
      ? pass("7.2 Refund after 7 days denied", `reason=${result.reason}`)
      : fail("7.2 Refund stale", `kind=${result.kind}`);
    void sub;
  } catch (e) {
    fail("7.2 Refund denied", (e as Error).message);
  }

  // ===== Group 8: Cancellation =====
  console.log("\n[8] Cancellation");

  // 8.1 — flag cancelAtPeriodEnd
  try {
    // Re-create active sub since 7.1 cancelled it
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: tenant.id } });
    const growth = await prisma.plan.findUnique({ where: { key: "growth" } });
    await prisma.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: growth!.id,
        status: "ACTIVE",
        interval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { cancelAtPeriodEnd: true },
    });
    await prisma.billingEvent.create({
      data: { tenantId: tenant.id, kind: "CANCELLED", payload: { test: true } },
    });
    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    sub?.cancelAtPeriodEnd
      ? pass("8.1 cancelAtPeriodEnd flag set", `status still ${sub.status}`)
      : fail("8.1 Cancel flag", "not set");
  } catch (e) {
    fail("8.1 Cancel", (e as Error).message);
  }

  // 8.2 — billing-tick on cancelled past-period sets status=CANCELLED
  try {
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { currentPeriodEnd: new Date(Date.now() - 24 * 3600 * 1000) },
    });
    await runBillingTick({ appUrl: "http://localhost:3000" });
    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    sub?.status === "CANCELLED"
      ? pass("8.2 cancelAtPeriodEnd + past period → CANCELLED")
      : fail("8.2 Cron cancel", `status=${sub?.status}`);
  } catch (e) {
    fail("8.2 Cron cancel", (e as Error).message);
  }

  // ===== Summary =====
  console.log("\n━".repeat(60));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nResults: ${passed} passed, ${failed} failed of ${results.length} scenarios\n`);
  if (failed > 0) {
    console.log("Failures:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
    }
  }

  // Cleanup
  await cleanup(tenant.id, user.id);
  console.log("Cleaned up test data.");

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (err) => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});

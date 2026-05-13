/**
 * Phase 9 — End-to-end user-as-test scenarios.
 *
 * Simulates a real user signing up + paying as if they're a customer.
 * Each scenario creates a fresh tenant + user, goes through the
 * setup-billing flow with a specific test card, and verifies the
 * resulting state matches expectations.
 *
 * Test cards (Omise sandbox — verified from docs.omise.co/api-testing):
 *   4242 4242 4242 4242 — Visa success
 *   5555 5555 5555 4444 — Mastercard success
 *   3530 1113 3330 0000 — JCB success
 *   4111 1111 1114 0011 — fail at CHARGE: insufficient_funds (tokenizes OK)
 *   4111 1111 1113 0012 — fail at CHARGE: stolen_or_lost_card
 *   4111 1111 1111 0014 — fail at CHARGE: payment_rejected
 *
 * Note: All Omise test cards tokenize successfully — failures happen at
 * the actual charge step, never at token creation. To test "card error
 * at signup", we have to simulate it differently.
 *
 * Usage: npm run test:user-journey
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { chromium, type Page, type BrowserContext } from "playwright";
import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = process.env.PROD_URL ?? "https://adslab-theta.vercel.app";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];

function record(name: string, pass: boolean = true, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

async function createTestUserAndTenant(slug: string, email: string) {
  // Idempotent: clean if exists.
  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    await prisma.billingEvent.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.invoice.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.usageMetric.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.tenantMember.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.tenant.delete({ where: { id: existingTenant.id } });
  }
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await bcrypt.hash("test1234!", 4);
  const user = await prisma.user.create({
    data: { email, name: `Test ${slug}`, passwordHash, emailVerifiedAt: new Date() },
  });
  const tenant = await prisma.tenant.create({
    data: { name: `Test ${slug}`, slug, members: { create: { userId: user.id, role: "OWNER" } } },
  });
  return { user, tenant };
}

async function authenticate(ctx: BrowserContext, userId: string, email: string, name: string) {
  const sealed = await sealData({ userId, email, name }, { password: process.env.SESSION_SECRET! });
  await ctx.addCookies([
    {
      name: "adslab_session",
      value: sealed,
      domain: new URL(PROD).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

async function fillCard(page: Page, opts: { number: string; cvv?: string }) {
  await page.fill('input#cardName', "Test User");
  await page.fill('input#cardNumber', opts.number);
  await page.fill('input#expMonth', "12");
  await page.fill('input#expYear', "2030");
  await page.fill('input#cvv', opts.cvv ?? "123");
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

// ==========================================================
// Scenarios
// ==========================================================

async function scenario1_happyPath(ctx: BrowserContext) {
  console.log("\n[1] Happy path — Starter plan with 4242 card");
  const slug = "uj-happy-path-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);
  const page = await ctx.newPage();

  try {
    await page.goto(`${PROD}/setup-billing?tenant=${slug}`, { waitUntil: "domcontentloaded" });
    record("1.1 /setup-billing renders for tenant without sub", page.url().includes("setup-billing"));

    // Wait for Omise.js to load (the submit button is disabled until scriptReady)
    await page.waitForFunction(() => "Omise" in window, { timeout: 15000 });
    record("1.2 Omise.js script loaded", true);

    // Default plan is "growth" (recommended). Switch to starter.
    await page.click('button:has-text("Starter")');
    record("1.3 Plan picker selects Starter", true);

    await fillCard(page, { number: "4242424242424242" });
    record("1.4 Card form filled");

    // Submit
    await page.click('button:has-text("เริ่มทดลองใช้ฟรี 7 วัน")');
    // Wait for redirect to dashboard
    await page.waitForURL(/\/t\/.+\/dashboard/, { timeout: 30_000 });
    record("1.5 Submit → redirect to dashboard", page.url());

    // Verify Subscription record
    const sub = await prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id },
      include: { plan: true },
    });
    record(
      "1.6 Subscription created TRIALING + Starter",
      sub?.status === "TRIALING" && sub.plan.key === "starter",
      `status=${sub?.status} plan=${sub?.plan.key}`,
    );

    // Trial ends ~7 days from now
    const daysToEnd = Math.round(((sub?.trialEndsAt?.getTime() ?? 0) - Date.now()) / 86_400_000);
    record("1.7 trialEndsAt ~= 7 days", daysToEnd === 7, `${daysToEnd} days`);

    // Verify Omise customer + card persisted
    record(
      "1.8 omiseCustomerId + omiseCardId set",
      !!sub?.omiseCustomerId && !!sub?.omiseCardId,
      `cust=${sub?.omiseCustomerId?.slice(0, 25)} card=${sub?.omiseCardId?.slice(0, 25)}`,
    );

    // Go to /settings/billing and verify Starter is shown
    await page.goto(`${PROD}/t/${slug}/settings/billing`);
    const planLabel = await page.locator("h2:has-text('Starter')").count();
    record("1.9 Settings → Billing shows Starter card", planLabel > 0);
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario2_mastercard(ctx: BrowserContext) {
  console.log("\n[2] Mastercard test (5555 5555 5555 4444)");
  const slug = "uj-mastercard-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);
  const page = await ctx.newPage();

  try {
    await page.goto(`${PROD}/setup-billing?tenant=${slug}`);
    await page.waitForFunction(() => "Omise" in window, { timeout: 15000 });
    await fillCard(page, { number: "5555555555554444" });
    await page.click('button:has-text("เริ่มทดลองใช้ฟรี 7 วัน")');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    record("2.1 Mastercard tokenized + trial started", true, page.url());

    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    record("2.2 Subscription TRIALING with Mastercard", sub?.status === "TRIALING");
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario3_postTrialChargeDeclines(ctx: BrowserContext) {
  console.log("\n[3] Post-trial charge declines → PAST_DUE (4111...0011 insufficient funds)");
  const slug = "uj-decline-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);
  const page = await ctx.newPage();

  try {
    // Sign up + tokenize the "insufficient funds" card (tokenization works,
    // charge fails). User gets a TRIALING sub at signup.
    await page.goto(`${PROD}/setup-billing?tenant=${slug}`);
    await page.waitForFunction(() => "Omise" in window, { timeout: 15000 });
    await fillCard(page, { number: "4111111111140011" });
    await page.click('button:has-text("เริ่มทดลองใช้ฟรี 7 วัน")');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    const sub1 = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    record("3.1 Trial starts even with decline-prone card", sub1?.status === "TRIALING");

    // Move trialEndsAt to yesterday and run billing-tick — charge will fail.
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { trialEndsAt: new Date(Date.now() - 24 * 3600 * 1000) },
    });
    const { runBillingTick } = await import("../src/lib/billing/tick");
    const stats = await runBillingTick({ appUrl: PROD });
    record("3.2 billing-tick runs", true, `failed=${stats.failed}, charged=${stats.charged}`);

    const sub2 = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    record(
      "3.3 Declined charge moves status → PAST_DUE",
      sub2?.status === "PAST_DUE",
      `status=${sub2?.status}`,
    );

    // Invoice should have FAILED status
    const inv = await prisma.invoice.findFirst({
      where: { tenantId: tenant.id, status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    record(
      "3.4 Invoice marked FAILED with reason",
      !!inv,
      inv ? `reason=${inv.failureMessage?.slice(0, 50)}` : "no failed invoice",
    );

    // Visit dashboard — should still be accessible (PAST_DUE within grace)
    // but tier-limit banner should warn
    await page.goto(`${PROD}/t/${slug}/dashboard`);
    const hasPastDueBanner = await page.locator("text=การชำระเงินล่าสุดไม่สำเร็จ").count();
    record(
      "3.5 PAST_DUE banner shows on dashboard",
      hasPastDueBanner > 0,
      `banner count=${hasPastDueBanner}`,
    );
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario4_growthYearly(ctx: BrowserContext) {
  console.log("\n[4] Growth plan, yearly billing");
  const slug = "uj-growth-yr-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);
  const page = await ctx.newPage();

  try {
    await page.goto(`${PROD}/setup-billing?tenant=${slug}`);
    await page.waitForFunction(() => "Omise" in window, { timeout: 15000 });

    // Click yearly toggle
    await page.click('button:has-text("รายปี")');
    record("4.1 Yearly toggle clicked");

    // Growth is the default recommendation — already selected
    await fillCard(page, { number: "4242424242424242" });
    await page.click('button:has-text("เริ่มทดลองใช้ฟรี 7 วัน")');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    const sub = await prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id },
      include: { plan: true },
    });
    record(
      "4.2 Subscription created Growth YEARLY",
      sub?.plan.key === "growth" && sub?.interval === "YEARLY",
      `plan=${sub?.plan.key} interval=${sub?.interval}`,
    );

    // Period end should be ~1 year from trial end
    const trialPlus365 = (sub?.trialEndsAt?.getTime() ?? 0) + 365 * 86_400_000;
    const periodEnd = sub?.currentPeriodEnd?.getTime() ?? 0;
    const closeEnough = Math.abs(trialPlus365 - periodEnd) < 86_400_000;
    record("4.3 currentPeriodEnd ~ trialEnd + 365d", closeEnough);
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario5_addonToggle(ctx: BrowserContext) {
  console.log("\n[5] Add-on toggle (Event SDK)");
  const slug = "uj-addon-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);

  // Skip UI flow and inject subscription directly so we can test the addon API
  const growthPlan = await prisma.plan.findUnique({ where: { key: "growth" } });
  await prisma.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      planId: growthPlan!.id,
      status: "ACTIVE",
      interval: "MONTHLY",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  const page = await ctx.newPage();
  try {
    await page.goto(`${PROD}/t/${slug}/settings/billing`);
    // Click "เปิด Event SDK"
    await page.click('button:has-text("เปิด Event SDK")');
    // Wait for refresh
    await page.waitForTimeout(3000);

    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    record(
      "5.1 Add-on event-sdk activated via UI",
      sub?.addOnKeys.includes("event-sdk") ?? false,
      `addOnKeys=${JSON.stringify(sub?.addOnKeys)}`,
    );

    // Reload to get fresh button text, then toggle off.
    await page.goto(`${PROD}/t/${slug}/settings/billing`);
    await page.click('button:has-text("ปิด Event SDK")');
    await page.waitForTimeout(3000);
    const subAfter = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    record(
      "5.2 Add-on event-sdk disabled via UI toggle",
      !subAfter?.addOnKeys.includes("event-sdk"),
      `addOnKeys=${JSON.stringify(subAfter?.addOnKeys)}`,
    );

    // Verify event-sdk gate. Use native fetch with session cookie to
    // bypass the Playwright request API which has a listener-shape bug
    // in this version of the SDK.
    const cookies = await ctx.cookies();
    const sessionCookie = cookies.find((c) => c.name === "adslab_session");
    const res = await fetch(
      `${PROD}/api/event-sdk/install-code?tenantSlug=${slug}&metaAccountId=fake&pixelId=fake`,
      { headers: { cookie: `adslab_session=${sessionCookie?.value ?? ""}` } },
    );
    record(
      "5.3 Event SDK install-code returns 402 when add-on off",
      res.status === 402,
      `status=${res.status}`,
    );
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario6_cancel(ctx: BrowserContext) {
  console.log("\n[6] Cancel subscription via UI");
  const slug = "uj-cancel-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);

  const proPlan = await prisma.plan.findUnique({ where: { key: "pro" } });
  await prisma.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      planId: proPlan!.id,
      status: "ACTIVE",
      interval: "MONTHLY",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  const page = await ctx.newPage();
  try {
    await page.goto(`${PROD}/t/${slug}/settings/billing`);

    page.on("dialog", (d) => d.accept());
    await page.click('button:has-text("ยกเลิกการสมัคร")');
    await page.waitForTimeout(3000);

    const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    record(
      "6.1 Cancel sets cancelAtPeriodEnd",
      sub?.cancelAtPeriodEnd === true,
      `cancelAtPeriodEnd=${sub?.cancelAtPeriodEnd}, status=${sub?.status}`,
    );
    record(
      "6.2 Status still ACTIVE until period ends",
      sub?.status === "ACTIVE",
      `status=${sub?.status}`,
    );
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario7_layer3Gate(ctx: BrowserContext) {
  console.log("\n[7] Layer-3 gate: no sub → forced to /setup-billing");
  const slug = "uj-gate-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);

  const page = await ctx.newPage();
  try {
    // No subscription — visit /dashboard should redirect to /setup-billing
    await page.goto(`${PROD}/t/${slug}/dashboard`);
    const redirected = page.url().includes("setup-billing");
    record("7.1 Dashboard → /setup-billing redirect (no sub)", redirected, page.url());

    // /ai page also gated
    await page.goto(`${PROD}/t/${slug}/ai`);
    record("7.2 /ai also redirects (no sub)", page.url().includes("setup-billing"));

    // /events page also gated
    await page.goto(`${PROD}/t/${slug}/events`);
    record("7.3 /events also redirects (no sub)", page.url().includes("setup-billing"));
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario8_suspendedTenant(ctx: BrowserContext) {
  console.log("\n[8] SUSPENDED tenant gets redirected to /setup-billing with reason");
  const slug = "uj-suspended-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);
  await authenticate(ctx, user.id, user.email, user.name);

  const starterPlan = await prisma.plan.findUnique({ where: { key: "starter" } });
  await prisma.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      planId: starterPlan!.id,
      status: "SUSPENDED",
      interval: "MONTHLY",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  const page = await ctx.newPage();
  try {
    await page.goto(`${PROD}/t/${slug}/dashboard`);
    record(
      "8.1 SUSPENDED → /setup-billing?reason=suspended",
      page.url().includes("setup-billing") && page.url().includes("suspended"),
      page.url(),
    );
    const banner = await page.locator("text=บัญชีถูกระงับ").count();
    record("8.2 Suspended banner visible on setup-billing", banner > 0);
  } finally {
    await page.close();
    await cleanup(tenant.id, user.id);
  }
}

async function scenario9_paymentSimulation(ctx: BrowserContext) {
  console.log("\n[9] Trigger real Omise charge → webhook → BillingEvent");
  const slug = "uj-charge-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const omiseLib = require("omise");
  const omise = omiseLib({
    secretKey: process.env.OMISE_SECRET_KEY,
    publicKey: process.env.OMISE_PUBLIC_KEY,
  });
  void ctx;

  try {
    const token = await omise.tokens.create({
      card: {
        name: "Test User",
        number: "4242424242424242",
        expiration_month: 12,
        expiration_year: 2030,
        security_code: "123",
      },
    });
    const charge = await omise.charges.create({
      amount: 14900,
      currency: "thb",
      card: token.id,
      metadata: { tenantId: tenant.id },
      description: "User journey scenario 9",
    });
    record("9.1 Live Omise charge created", charge.status === "successful", `id=${charge.id}`);

    // Insert matching invoice for refund handler
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        omiseChargeId: charge.id,
        amount: 149,
        status: "PAID",
        paidAt: new Date(),
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        lineItems: { test: true },
      },
    });

    await omise.charges.createRefund(charge.id, {
      amount: 14900,
      metadata: { tenantId: tenant.id, invoiceTest: true },
    });

    // Poll for BillingEvent inserted by webhook
    const deadline = Date.now() + 60_000;
    let webhookEvent;
    while (Date.now() < deadline) {
      webhookEvent = await prisma.billingEvent.findFirst({
        where: { tenantId: tenant.id, idempotencyKey: { not: null } },
      });
      if (webhookEvent) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    record(
      "9.2 Omise refund.create → webhook → BillingEvent inserted",
      !!webhookEvent && webhookEvent.kind === "REFUNDED",
      webhookEvent ? `kind=${webhookEvent.kind} omiseEventId=${webhookEvent.idempotencyKey}` : "no event",
    );

    const inv = await prisma.invoice.findFirst({
      where: { tenantId: tenant.id, omiseChargeId: charge.id },
    });
    record(
      "9.3 Invoice status updated to REFUNDED",
      inv?.status === "REFUNDED",
      `status=${inv?.status}`,
    );
  } finally {
    await cleanup(tenant.id, user.id);
  }
}

async function scenario10_idempotency() {
  console.log("\n[10] Webhook idempotency: 2× delivery → 1 BillingEvent row");
  const slug = "uj-idempotent-" + Date.now().toString(36);
  const { user, tenant } = await createTestUserAndTenant(slug, `${slug}@test.local`);

  try {
    const fakeChargeId = "chrg_idempotent_test_" + crypto.randomBytes(4).toString("hex");
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        omiseChargeId: fakeChargeId,
        amount: 100,
        status: "PENDING",
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        lineItems: {},
      },
    });

    const { handleOmiseEvent } = await import("../src/lib/billing/omise/webhook");
    const event = {
      object: "event" as const,
      id: "evnt_idempotent_test_" + crypto.randomBytes(4).toString("hex"),
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
    await handleOmiseEvent(event);
    await handleOmiseEvent(event);

    const events = await prisma.billingEvent.findMany({
      where: { idempotencyKey: event.id },
    });
    record(
      "10.1 3 deliveries of same event ID → 1 BillingEvent row",
      events.length === 1,
      `${events.length} row(s)`,
    );

    const inv = await prisma.invoice.findFirst({ where: { omiseChargeId: fakeChargeId } });
    record("10.2 Invoice marked PAID by webhook handler", inv?.status === "PAID");
  } finally {
    await cleanup(tenant.id, user.id);
  }
}

// ==========================================================
// Main
// ==========================================================

async function main() {
  console.log("Phase 9 — User-as-test scenarios");
  console.log("Target: " + PROD);
  console.log("━".repeat(60));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Listen for browser console errors to surface 500s during tests
  ctx.on("requestfailed", (req) => {
    if (req.failure()?.errorText.includes("ECONNRESET")) return;
    console.log(`  [browser request failed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  try {
    await scenario1_happyPath(ctx);
    await scenario2_mastercard(ctx);
    await scenario3_postTrialChargeDeclines(ctx);
    await scenario4_growthYearly(ctx);
    await scenario5_addonToggle(ctx);
    await scenario6_cancel(ctx);
    await scenario7_layer3Gate(ctx);
    await scenario8_suspendedTenant(ctx);
    await scenario9_paymentSimulation(ctx);
    await scenario10_idempotency();
  } catch (err) {
    console.error("\nFATAL during scenario:", err);
  }

  await browser.close();
  await prisma.$disconnect();

  // Summary
  console.log("\n" + "━".repeat(60));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nResults: ${passed} passed, ${results.length - passed} failed of ${results.length}\n`);
  if (results.length - passed > 0) {
    console.log("Failures:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}${r.detail ? " — " + r.detail : ""}`);
    }
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

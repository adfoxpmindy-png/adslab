/**
 * Omise webhook handler. Verifies HMAC-SHA256 signature and dispatches
 * to per-event-type handlers. Idempotency: every Omise event ID is
 * stored as `BillingEvent.idempotencyKey` (UNIQUE) — a duplicate
 * webhook will hit the unique violation and short-circuit.
 */

import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

import type { OmiseCharge } from "./client";

type OmiseWebhookEvent = {
  object: "event";
  id: string;
  livemode: boolean;
  key: string; // e.g. "charge.complete", "charge.failed", "refund.create", "dispute.create"
  created_at: string;
  data: Record<string, unknown> & { object?: string };
};

/**
 * Verify Omise-Signature header. The signed payload is
 * `{timestamp}.{rawBody}` and the secret is base64-encoded.
 *
 * Returns true if any of the comma-separated signatures match (Omise
 * sends both old + new during secret rotation).
 */
export function verifyOmiseSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secret: string;
}): boolean {
  if (!opts.signatureHeader || !opts.timestampHeader) return false;
  const decodedSecret = Buffer.from(opts.secret, "base64");
  const signedPayload = `${opts.timestampHeader}.${opts.rawBody}`;
  const expected = crypto
    .createHmac("sha256", decodedSecret)
    .update(signedPayload)
    .digest("hex");
  const provided = opts.signatureHeader.split(",").map((s) => s.trim());
  return provided.some((p) =>
    crypto.timingSafeEqual(Buffer.from(p), Buffer.from(expected)),
  );
}

/** Omise event keys we act on. Other keys (e.g. charge.create) are
 *  acknowledged with 200 but skipped — no BillingEvent inserted. */
const HANDLED_KEYS = new Set([
  "charge.complete",
  "charge.failed",
  "refund.create",
  "dispute.create",
]);

export async function handleOmiseEvent(event: OmiseWebhookEvent): Promise<void> {
  // Determine tenantId from the underlying charge/refund metadata.
  const tenantId = extractTenantId(event);
  if (!tenantId) {
    console.warn(`[omise webhook] no tenantId in event ${event.id}`);
    return;
  }

  // Skip events we don't act on. Omise fires charge.create immediately
  // after a charge is created — but we already recorded the Invoice
  // synchronously in chargeTenant(); the charge.create webhook adds no
  // information. Acknowledging with 200 is enough.
  if (!HANDLED_KEYS.has(event.key)) {
    return;
  }

  // Idempotency check — insert BillingEvent first, bail if duplicate.
  try {
    await prisma.billingEvent.create({
      data: {
        tenantId,
        kind: mapEventKind(event.key),
        idempotencyKey: event.id,
        payload: event as unknown as object,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      // Duplicate event — already processed, ignore.
      return;
    }
    throw err;
  }

  switch (event.key) {
    case "charge.complete":
      await handleChargeComplete(event.data as unknown as OmiseCharge, tenantId);
      break;
    case "charge.failed":
      await handleChargeFailed(event.data as unknown as OmiseCharge, tenantId);
      break;
    case "refund.create":
      await handleRefundCreate(event.data as Record<string, unknown>, tenantId);
      break;
    case "dispute.create":
      await handleDisputeCreate(tenantId);
      break;
  }
}

function extractTenantId(event: OmiseWebhookEvent): string | null {
  const data = event.data as { metadata?: Record<string, string> };
  return data.metadata?.tenantId ?? null;
}

function mapEventKind(omiseKey: string): "CHARGE_SUCCESS" | "CHARGE_FAILED" | "REFUNDED" | "SUSPENDED" {
  // Caller filters via HANDLED_KEYS — these are the only inputs we see.
  switch (omiseKey) {
    case "charge.complete":
      return "CHARGE_SUCCESS";
    case "charge.failed":
      return "CHARGE_FAILED";
    case "refund.create":
      return "REFUNDED";
    case "dispute.create":
      return "SUSPENDED";
    default:
      // Unreachable — HANDLED_KEYS filter prevents this.
      throw new Error(`unexpected event key: ${omiseKey}`);
  }
}

async function handleChargeComplete(charge: OmiseCharge, tenantId: string) {
  await prisma.$transaction([
    prisma.invoice.updateMany({
      where: { omiseChargeId: charge.id },
      data: {
        status: "PAID",
        paidAt: charge.paid_at ? new Date(charge.paid_at) : new Date(),
      },
    }),
    prisma.tenantSubscription.updateMany({
      where: { tenantId, status: { in: ["TRIALING", "PAST_DUE"] } },
      data: { status: "ACTIVE" },
    }),
  ]);
}

async function handleChargeFailed(charge: OmiseCharge, tenantId: string) {
  await prisma.$transaction([
    prisma.invoice.updateMany({
      where: { omiseChargeId: charge.id },
      data: {
        status: "FAILED",
        failureCode: charge.failure_code,
        failureMessage: charge.failure_message,
      },
    }),
    prisma.tenantSubscription.updateMany({
      where: { tenantId, status: { in: ["TRIALING", "ACTIVE"] } },
      data: { status: "PAST_DUE" },
    }),
  ]);
}

async function handleRefundCreate(
  data: Record<string, unknown>,
  tenantId: string,
) {
  const chargeId = data.charge as string | undefined;
  if (!chargeId) return;
  await prisma.invoice.updateMany({
    where: { tenantId, omiseChargeId: chargeId },
    data: { status: "REFUNDED" },
  });
}

async function handleDisputeCreate(tenantId: string) {
  await prisma.tenantSubscription.updateMany({
    where: { tenantId },
    data: { status: "SUSPENDED" },
  });
}

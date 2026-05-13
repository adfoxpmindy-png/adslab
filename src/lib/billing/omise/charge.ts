/**
 * Charge orchestration. Creates an Omise charge against a saved
 * customer's default card and records the result as an Invoice row.
 *
 * Non-3DS THB charges complete synchronously (status returned in API
 * response). 3DS-required cards return `authorize_uri` and complete
 * via `charge.complete` webhook later — in that case we store the
 * Invoice as PENDING and let the webhook flip it to PAID.
 */

import { prisma } from "@/lib/prisma";

import { omise, toSatang, type OmiseCharge } from "./client";

export type ChargeResult =
  | { kind: "paid"; invoiceId: string; charge: OmiseCharge }
  | { kind: "pending_3ds"; invoiceId: string; authorizeUri: string }
  | { kind: "failed"; invoiceId: string; failureMessage: string };

export async function chargeTenant(opts: {
  tenantId: string;
  customerId: string;
  amountThb: number;
  description: string;
  periodStart: Date;
  periodEnd: Date;
  lineItems: unknown;
  returnUri?: string;
}): Promise<ChargeResult> {
  const o = omise();

  let charge: OmiseCharge;
  try {
    charge = await o.charges.create({
      amount: toSatang(opts.amountThb),
      currency: "thb",
      customer: opts.customerId,
      description: opts.description,
      metadata: { tenantId: opts.tenantId },
      return_uri: opts.returnUri,
    });
  } catch (err) {
    // Network / Omise rejection — create a FAILED invoice for audit.
    const inv = await prisma.invoice.create({
      data: {
        tenantId: opts.tenantId,
        amount: opts.amountThb,
        status: "FAILED",
        billingPeriodStart: opts.periodStart,
        billingPeriodEnd: opts.periodEnd,
        failureMessage: (err as Error).message ?? "unknown",
        lineItems: opts.lineItems as object,
      },
    });
    return {
      kind: "failed",
      invoiceId: inv.id,
      failureMessage: (err as Error).message ?? "unknown",
    };
  }

  // Map Omise status → our InvoiceStatus.
  const status =
    charge.status === "successful"
      ? "PAID"
      : charge.status === "pending"
        ? "PENDING"
        : "FAILED";

  const inv = await prisma.invoice.create({
    data: {
      tenantId: opts.tenantId,
      omiseChargeId: charge.id,
      amount: opts.amountThb,
      status,
      billingPeriodStart: opts.periodStart,
      billingPeriodEnd: opts.periodEnd,
      paidAt: charge.paid_at ? new Date(charge.paid_at) : null,
      failureCode: charge.failure_code,
      failureMessage: charge.failure_message,
      lineItems: opts.lineItems as object,
    },
  });

  if (charge.status === "successful") {
    return { kind: "paid", invoiceId: inv.id, charge };
  }
  if (charge.status === "pending" && charge.authorize_uri) {
    return {
      kind: "pending_3ds",
      invoiceId: inv.id,
      authorizeUri: charge.authorize_uri,
    };
  }
  return {
    kind: "failed",
    invoiceId: inv.id,
    failureMessage: charge.failure_message ?? "Charge declined",
  };
}

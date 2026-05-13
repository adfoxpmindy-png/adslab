/**
 * Pro-rated refund within the 7-day grace window. Outside the window,
 * refund is denied — user can still cancel renewal.
 */

import { prisma } from "@/lib/prisma";

import { omise, toSatang } from "./client";
import { computeRefund } from "../tier-rules";

export type RefundResult =
  | { kind: "refunded"; invoiceId: string; amount: number }
  | { kind: "denied"; reason: "outside_window" | "not_paid" | "already_refunded" };

export async function refundInvoice(opts: {
  tenantId: string;
  invoiceId: string;
  now?: Date;
}): Promise<RefundResult> {
  const now = opts.now ?? new Date();
  const invoice = await prisma.invoice.findFirst({
    where: { id: opts.invoiceId, tenantId: opts.tenantId },
  });
  if (!invoice) return { kind: "denied", reason: "not_paid" };
  if (invoice.status === "REFUNDED") {
    return { kind: "denied", reason: "already_refunded" };
  }
  if (invoice.status !== "PAID") return { kind: "denied", reason: "not_paid" };
  if (!invoice.paidAt || !invoice.omiseChargeId) {
    return { kind: "denied", reason: "not_paid" };
  }

  const sevenDays = 7 * 24 * 3600 * 1000;
  if (now.getTime() - invoice.paidAt.getTime() > sevenDays) {
    return { kind: "denied", reason: "outside_window" };
  }

  const amount = computeRefund({
    invoiceAmount: invoice.amount,
    periodStart: invoice.billingPeriodStart,
    periodEnd: invoice.billingPeriodEnd,
    now,
  });

  if (amount <= 0) return { kind: "denied", reason: "outside_window" };

  await omise().charges.createRefund(invoice.omiseChargeId, {
    amount: toSatang(amount),
    metadata: { tenantId: opts.tenantId, invoiceId: opts.invoiceId },
  });

  await prisma.invoice.update({
    where: { id: opts.invoiceId },
    data: { status: "REFUNDED" },
  });

  await prisma.tenantSubscription.update({
    where: { tenantId: opts.tenantId },
    data: { status: "CANCELLED", cancelledAt: now },
  });

  return { kind: "refunded", invoiceId: opts.invoiceId, amount };
}

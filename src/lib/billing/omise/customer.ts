/**
 * Omise customer management. One Omise customer per AdsLab tenant.
 * Card token is single-use — once attached to a customer, the
 * customer's default_card persists for recurring charges.
 */

import { prisma } from "@/lib/prisma";

import { omise } from "./client";

/**
 * Attach a card token to a tenant's Omise customer. Creates the
 * customer on first call. Returns Omise customer ID.
 *
 * Called from /api/billing/checkout after Omise.js produces a token.
 */
export async function saveCardToCustomer(opts: {
  tenantId: string;
  email: string;
  cardToken: string;
}): Promise<{ customerId: string; cardId: string }> {
  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId: opts.tenantId },
    select: { omiseCustomerId: true },
  });

  const o = omise();

  if (sub?.omiseCustomerId) {
    // Existing customer — attach a new card and make it default.
    const updated = await o.customers.update(sub.omiseCustomerId, {
      card: opts.cardToken,
    });
    if (!updated.default_card) {
      throw new Error("Omise update returned no default_card");
    }
    return { customerId: updated.id, cardId: updated.default_card };
  }

  // First-time — create a new Omise customer with the card attached.
  const created = await o.customers.create({
    email: opts.email,
    description: `AdsLab tenant ${opts.tenantId}`,
    card: opts.cardToken,
    metadata: { tenantId: opts.tenantId },
  });
  if (!created.default_card) {
    throw new Error("Omise create returned no default_card");
  }
  return { customerId: created.id, cardId: created.default_card };
}

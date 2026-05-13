import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { startTrial } from "@/lib/billing/checkout";
import { type PlanKey } from "@/lib/billing/plans";

const Schema = z.object({
  tenantSlug: z.string(),
  planKey: z.enum(["starter", "growth", "pro", "scale"]),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  addOnKeys: z.array(
    z.enum(["event-sdk", "white-label", "priority-ai"]),
  ).default([]),
  extraAdAccounts: z.number().int().min(0).max(50).default(0),
  cardToken: z.string().regex(/^tokn_/),
});

export async function POST(req: Request) {
  const session = await requireSession();
  const body = Schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_input", details: body.error.issues },
      { status: 400 },
    );
  }

  // Verify caller is OWNER of the tenant.
  const tenant = await prisma.tenant.findUnique({
    where: { slug: body.data.tenantSlug },
    select: {
      id: true,
      members: {
        where: { userId: session.userId, role: "OWNER" },
        select: { id: true },
      },
    },
  });
  if (!tenant || tenant.members.length === 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await startTrial({
      tenantId: tenant.id,
      email: session.email,
      planKey: body.data.planKey as PlanKey,
      interval: body.data.interval,
      addOnKeys: body.data.addOnKeys,
      extraAdAccounts: body.data.extraAdAccounts,
      cardToken: body.data.cardToken,
    });
    return NextResponse.json({
      ok: true,
      subscriptionId: result.subscriptionId,
      trialEndsAt: result.trialEndsAt.toISOString(),
      planKey: result.planKey,
      total: result.total,
    });
  } catch (err) {
    console.error("[checkout]", err);
    return NextResponse.json(
      { error: "checkout_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}

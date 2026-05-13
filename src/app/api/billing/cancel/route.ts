import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const Schema = z.object({ tenantSlug: z.string() });

export async function POST(req: Request) {
  const session = await requireSession();
  const body = Schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

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

  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
  });
  if (!sub) return NextResponse.json({ error: "no_subscription" }, { status: 404 });

  // Mark for cancellation at period end. Access continues until then.
  await prisma.tenantSubscription.update({
    where: { tenantId: tenant.id },
    data: { cancelAtPeriodEnd: true },
  });

  await prisma.billingEvent.create({
    data: {
      tenantId: tenant.id,
      kind: "CANCELLED",
      payload: { cancelAtPeriodEnd: true, periodEnd: sub.currentPeriodEnd },
    },
  });

  return NextResponse.json({
    ok: true,
    accessUntil: sub.currentPeriodEnd.toISOString(),
  });
}

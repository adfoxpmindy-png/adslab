import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { refundInvoice } from "@/lib/billing/omise/refund";

const Schema = z.object({
  tenantSlug: z.string(),
  invoiceId: z.string().cuid(),
});

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

  const result = await refundInvoice({
    tenantId: tenant.id,
    invoiceId: body.data.invoiceId,
  });

  if (result.kind === "refunded") {
    return NextResponse.json({ ok: true, amount: result.amount });
  }
  return NextResponse.json(
    { ok: false, reason: result.reason },
    { status: 400 },
  );
}

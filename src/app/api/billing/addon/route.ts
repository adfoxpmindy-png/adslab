import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  tenantSlug: z.string(),
  action: z.enum(["add", "remove"]),
  addOnKey: z.enum(["event-sdk", "white-label", "priority-ai"]),
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

  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
  });
  if (!sub) {
    return NextResponse.json({ error: "no_subscription" }, { status: 404 });
  }

  const current = new Set(sub.addOnKeys);
  const before = current.has(body.data.addOnKey);
  if (body.data.action === "add") current.add(body.data.addOnKey);
  else current.delete(body.data.addOnKey);

  if (
    (body.data.action === "add" && before) ||
    (body.data.action === "remove" && !before)
  ) {
    return NextResponse.json({ ok: true, noop: true });
  }

  await prisma.tenantSubscription.update({
    where: { tenantId: tenant.id },
    data: { addOnKeys: Array.from(current) },
  });

  await prisma.billingEvent.create({
    data: {
      tenantId: tenant.id,
      kind: body.data.action === "add" ? "ADDON_ADDED" : "ADDON_REMOVED",
      payload: { addOnKey: body.data.addOnKey },
    },
  });

  return NextResponse.json({ ok: true, addOnKeys: Array.from(current) });
}

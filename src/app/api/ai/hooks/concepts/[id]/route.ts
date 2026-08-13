/**
 * PATCH /api/ai/hooks/concepts/[id] — update status / notes /
 *   andromedaOverrideChosen.
 * DELETE /api/ai/hooks/concepts/[id] — soft delete (status="archived")
 *   by default; ?hard=true removes the row (cascade nulls iterations'
 *   parentConceptId via the schema's onDelete: SetNull).
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { resolveTenant } from "@/lib/hooks/route-helpers";
import { rowToConceptShape } from "@/lib/hooks/service";

const patchSchema = z.object({
  status: z.enum(["draft", "testing", "winner", "archived"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
  andromedaOverrideChosen: z.boolean().optional(),
  metaCampaignId: z.string().max(64).nullable().optional(),
  metaAdSetId: z.string().max(64).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await resolveTenant(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const raw = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.hookConcept.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updated = await prisma.hookConcept.update({
    where: { id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.andromedaOverrideChosen !== undefined
        ? { andromedaOverrideChosen: parsed.data.andromedaOverrideChosen }
        : {}),
      ...(parsed.data.metaCampaignId !== undefined
        ? { metaCampaignId: parsed.data.metaCampaignId }
        : {}),
      ...(parsed.data.metaAdSetId !== undefined
        ? { metaAdSetId: parsed.data.metaAdSetId }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, concept: rowToConceptShape(updated) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await resolveTenant(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true";

  const existing = await prisma.hookConcept.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (hard) {
    await prisma.hookConcept.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: "hard" });
  }

  const updated = await prisma.hookConcept.update({
    where: { id },
    data: { status: "archived" },
  });
  return NextResponse.json({ ok: true, deleted: "soft", concept: rowToConceptShape(updated) });
}

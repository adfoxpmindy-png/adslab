/**
 * GET /api/ai/hooks/concepts — list HookConcept rows for a tenant.
 *
 * Filters supported:
 *   - status           (draft | testing | winner | archived)
 *   - source           (generated | iteration | analyzed | manual)
 *   - parentConceptId  (drill into a saved winner's iteration tree)
 *   - limit / offset   (pagination; default 50 / 0)
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { resolveTenant } from "@/lib/hooks/route-helpers";
import { rowToConceptShape } from "@/lib/hooks/service";

const querySchema = z.object({
  status: z.enum(["draft", "testing", "winner", "archived"]).optional(),
  source: z.enum(["generated", "iteration", "analyzed", "manual"]).optional(),
  parentConceptId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  const auth = await resolveTenant(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const where = {
    tenantId: ctx.tenant.id,
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.source ? { source: parsed.data.source } : {}),
    ...(parsed.data.parentConceptId
      ? { parentConceptId: parsed.data.parentConceptId }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.hookConcept.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      skip: parsed.data.offset,
    }),
    prisma.hookConcept.count({ where }),
  ]);

  return NextResponse.json({
    ok: true,
    total,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    concepts: rows.map(rowToConceptShape),
  });
}

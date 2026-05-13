import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

const GOAL_OBJECTIVES = [
  "AWARENESS",
  "ENGAGEMENT",
  "TRAFFIC",
  "LEADS",
  "SALES",
  "APP_PROMOTION",
  "STORE_VISITS",
] as const;

const createSchema = z.object({
  pattern: z.string().min(1).max(200),
  isRegex: z.boolean().default(false),
  objective: z.enum(GOAL_OBJECTIVES),
  priority: z.number().int().min(0).max(1000).default(0),
});

const updateSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1).max(200).optional(),
  isRegex: z.boolean().optional(),
  objective: z.enum(GOAL_OBJECTIVES).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

/**
 * Validate a user-supplied regex BEFORE inserting it. Reject patterns
 * we cannot compile — if we accept them we'd crash every report run.
 * Length cap above is the soft ReDoS defense; for MVP we accept the
 * residual risk of slow regex.
 */
function validateRegex(pattern: string): string | null {
  try {
    new RegExp(pattern, "i");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * GET /api/naming-rules?tenantSlug=<slug>
 *
 * List all naming convention rules for the tenant, ordered by priority desc.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug);
  const rules = await prisma.namingConvention.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ rules });
}

/**
 * POST /api/naming-rules?tenantSlug=<slug>
 * Body: { pattern, isRegex?, objective, priority? }
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { pattern, isRegex, objective, priority } = parsed.data;
  if (isRegex) {
    const err = validateRegex(pattern);
    if (err) {
      return NextResponse.json({ error: `Invalid regex: ${err}` }, { status: 400 });
    }
  }

  try {
    const rule = await prisma.namingConvention.create({
      data: {
        tenantId: tenant.id,
        pattern,
        isRegex,
        objective,
        priority,
      },
    });
    return NextResponse.json({ rule });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "มีกฎสำหรับ pattern นี้แล้ว" },
        { status: 409 },
      );
    }
    throw e;
  }
}

/**
 * PATCH /api/naming-rules?tenantSlug=<slug>
 * Body: { id, ...fields to update }
 */
export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { id, ...updates } = parsed.data;
  if (updates.isRegex && updates.pattern) {
    const err = validateRegex(updates.pattern);
    if (err) {
      return NextResponse.json({ error: `Invalid regex: ${err}` }, { status: 400 });
    }
  }
  const existing = await prisma.namingConvention.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rule = await prisma.namingConvention.update({
    where: { id },
    data: updates,
  });
  return NextResponse.json({ rule });
}

/**
 * DELETE /api/naming-rules?tenantSlug=<slug>&id=<ruleId>
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const id = url.searchParams.get("id");
  if (!tenantSlug || !id) {
    return NextResponse.json({ error: "tenantSlug and id required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const existing = await prisma.namingConvention.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.namingConvention.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

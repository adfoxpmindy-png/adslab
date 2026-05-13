import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { duplicateCampaign } from "@/lib/meta/duplicate-campaign";

const bodySchema = z
  .object({
    sourceCampaignId: z.string().min(1),
    newName: z.string().min(1).max(200).optional(),
    dailyBudget: z.number().finite().positive().optional(),
    lifetimeBudget: z.number().finite().positive().optional(),
    dailyBudgetMultiplier: z.number().finite().positive().max(10).optional(),
    lifetimeBudgetMultiplier: z.number().finite().positive().max(10).optional(),
    initialStatus: z.enum(["PAUSED", "ACTIVE"]).optional(),
  })
  .refine(
    (b) => !(b.dailyBudget !== undefined && b.dailyBudgetMultiplier !== undefined),
    { message: "ระบุได้แค่ dailyBudget หรือ dailyBudgetMultiplier" },
  )
  .refine(
    (b) => !(b.lifetimeBudget !== undefined && b.lifetimeBudgetMultiplier !== undefined),
    { message: "ระบุได้แค่ lifetimeBudget หรือ lifetimeBudgetMultiplier" },
  );

/**
 * POST /api/meta/campaigns/duplicate?tenantSlug=<slug>
 *
 * Body validated by bodySchema above. Returns the newly-created campaign's
 * internal id + Meta id + display fields.
 *
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await duplicateCampaign({
    tenantId: tenant.id,
    userId: session.userId,
    ...parsed.data,
  });

  if (!result.ok) {
    const status = result.error.includes("not found") ? 404 : 502;
    return NextResponse.json({ error: result.error, logId: result.logId }, { status });
  }

  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { performCampaignAction } from "@/lib/meta/campaign-actions";

// Discriminated union — each action shape carries exactly the params
// it needs. Zod validates the right one based on `action`.
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    campaignId: z.string().min(1),
    action: z.literal("PAUSE"),
  }),
  z.object({
    campaignId: z.string().min(1),
    action: z.literal("RESUME"),
  }),
  z.object({
    campaignId: z.string().min(1),
    action: z.literal("SET_BUDGET"),
    // Caller must include exactly one of these. The service layer also
    // enforces this — we keep Zod permissive so the service error message
    // is the one users see ("Must specify daily or lifetime").
    dailyBudget: z.number().finite().min(0).optional(),
    lifetimeBudget: z.number().finite().min(0).optional(),
  }),
  z.object({
    campaignId: z.string().min(1),
    action: z.literal("SET_END_DATE"),
    // Accept ISO datetime; coerce to Date in the handler.
    endTime: z.string().datetime(),
  }),
]);

/**
 * POST /api/meta/campaign-actions?tenantSlug=<slug>
 * Body: discriminated by `action`:
 *   - { campaignId, action: "PAUSE" }
 *   - { campaignId, action: "RESUME" }
 *   - { campaignId, action: "SET_BUDGET", dailyBudget? | lifetimeBudget? }  (THB)
 *   - { campaignId, action: "SET_END_DATE", endTime: ISO string }
 *
 * Writes to Meta + audit-logs the result. OWNER + MEDIA_BUYER only.
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
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  // Convert ISO string → Date for the service layer.
  const actionInput =
    data.action === "SET_END_DATE"
      ? { ...data, endTime: new Date(data.endTime) }
      : data;

  const result = await performCampaignAction({
    tenantId: tenant.id,
    userId: session.userId,
    ...actionInput,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, logId: result.logId },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}

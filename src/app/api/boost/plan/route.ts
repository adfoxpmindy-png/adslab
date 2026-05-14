import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { planBoost } from "@/lib/boost/plan";

const bodySchema = z.object({
  promptText: z.string().min(10).max(4000),
});

/**
 * POST /api/boost/plan?tenantSlug=<slug>
 *
 * Body: { promptText: string }
 *
 * Returns the parsed boost plan (without executing). The user then
 * reviews the briefs and POSTs to /api/boost/execute to actually
 * create the campaigns.
 *
 * Roles: OWNER + MEDIA_BUYER (these are the people who run boost jobs).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await planBoost({
    tenantId: tenant.id,
    userId: session.userId,
    promptText: parsed.data.promptText,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, stage: result.stage },
      { status: result.stage === "parse" || result.stage === "resolve" ? 422 : 400 },
    );
  }

  return NextResponse.json(result);
}

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { extractJourney } from "@/lib/journey/extract";
import type { DateRangeKey } from "@/lib/meta/insights";

const RANGE_VALUES = ["today", "yesterday", "last_7d", "last_30d"] as const;

const querySchema = z.object({
  mode: z.enum(["overview", "drilldown"]).default("overview"),
  range: z.enum(RANGE_VALUES).default("last_30d"),
  campaignId: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const parsed = querySchema.safeParse({
    mode: url.searchParams.get("mode") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
    campaignId: url.searchParams.get("campaignId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.mode === "drilldown" && !parsed.data.campaignId) {
    return NextResponse.json(
      { error: "campaignId required for drilldown mode" },
      { status: 400 },
    );
  }

  const graph = await extractJourney({
    tenantId: tenant.id,
    userId: session.userId,
    range: parsed.data.range as DateRangeKey,
    mode: parsed.data.mode,
    drillCampaignId: parsed.data.campaignId,
  });

  return NextResponse.json({ graph });
}

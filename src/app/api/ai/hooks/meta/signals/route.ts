import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { fetchMetaSignals } from "@/lib/hooks/meta-signals";

/**
 * GET /api/ai/hooks/meta/signals?tenantSlug=X&metaCampaignId=Y
 *
 * Wraps fetchMetaSignals(). No caching — the underlying tools already
 * rate-limit and the frontend calls this on-demand from the winner card.
 * 30s wall-time cap on the function to bound worst-case Meta latency.
 */
export const maxDuration = 30;

const QuerySchema = z.object({
  tenantSlug: z.string().min(1),
  metaCampaignId: z.string().min(1),
});

export async function GET(request: Request): Promise<Response> {
  await requireSession();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    tenantSlug: url.searchParams.get("tenantSlug"),
    metaCampaignId: url.searchParams.get("metaCampaignId"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { tenantSlug, metaCampaignId } = parsed.data;
  const { tenant } = await requireTenantMember(tenantSlug);

  try {
    const signals = await fetchMetaSignals(tenant.id, metaCampaignId);
    return NextResponse.json(signals, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/ai/hooks/meta/signals]", (err as Error).message);
    return NextResponse.json(
      { error: "meta_signals_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}

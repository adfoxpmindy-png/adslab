import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "@/lib/meta/client";
import { fetchCampaignStructure } from "@/lib/meta/campaign-structure";
import { getEffectiveScope } from "@/lib/tenant-scope";
import { requireSession } from "@/lib/auth/session";

/**
 * GET /api/meta/campaigns/{campaignId}/structure?tenantSlug=<slug>
 *
 * Returns the ad set + ad tree (with insights) for one Meta campaign.
 * `campaignId` is the Meta campaign id (digits), not our internal id.
 *
 * The route is called lazily when a user expands a campaign row in the
 * campaigns table. Fetching is direct from Meta — we don't cache the
 * adset/ad metrics anywhere yet because they're cheap and the user
 * already paid the "wait" mental cost by clicking expand.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const { campaignId } = await params;

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  // Scope check: caller must have access to the campaign's ad account.
  // Look up our cached MetaCampaign to find its metaAccountId, then verify
  // it's in the user's effective scope.
  const connection = await getConnection(tenant.id);
  if (!connection || connection.status !== "ACTIVE") {
    return NextResponse.json({ error: "Meta connection inactive" }, { status: 412 });
  }

  const campaignRow = await prisma.metaCampaign.findFirst({
    where: { metaConnectionId: connection.id, metaCampaignId: campaignId },
    select: { metaAccountId: true },
  });
  if (!campaignRow) {
    return NextResponse.json({ error: "campaign not found in scope" }, { status: 404 });
  }

  const scope = await getEffectiveScope(session.userId, tenant.id);
  if (scope.accountIds !== null && !scope.accountIds.includes(campaignRow.metaAccountId)) {
    return NextResponse.json({ error: "campaign not in your scope" }, { status: 403 });
  }

  try {
    const accessToken = await getFreshAccessToken(connection);
    const structure = await fetchCampaignStructure({
      campaignId,
      accessToken,
      range: "last_30d",
    });
    return NextResponse.json(structure);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

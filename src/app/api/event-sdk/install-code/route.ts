import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { generateSiteKey } from "@/lib/event-sdk/site-key";
import { requireFeature, FeatureGateError, gateErrorToResponse } from "@/lib/billing/gate";
import { resolveUserLocale } from "@/lib/i18n/server";

/**
 * GET /api/event-sdk/install-code?tenantSlug=<slug>&metaAccountId=<act>&pixelId=<id>
 *
 * Returns the SDK install snippet for a given Pixel, with the
 * tenant-specific siteKey baked in. Verifies the pixel belongs to one
 * of the tenant's ad accounts (so users can't generate a siteKey
 * for someone else's Pixel).
 *
 * Authenticated; any tenant member can read.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const metaAccountId = url.searchParams.get("metaAccountId");
  const pixelId = url.searchParams.get("pixelId");
  if (!tenantSlug || !metaAccountId || !pixelId) {
    return NextResponse.json(
      { error: "tenantSlug + metaAccountId + pixelId required" },
      { status: 400 },
    );
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  const locale = await resolveUserLocale(session.userId);

  // Phase 9: Event SDK is a paid add-on. Block install-code endpoint
  // entirely so users see the upgrade prompt before they paste a snippet
  // that won't fire anything anyway.
  try {
    await requireFeature(tenant.id, "event-sdk", locale);
  } catch (err) {
    if (err instanceof FeatureGateError) return gateErrorToResponse(err);
    throw err;
  }

  const owned = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  const siteKey = generateSiteKey(tenant.id, pixelId);
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    request.headers.get("origin") ??
    "https://ads-lab.xyz";

  const snippet = `<!-- AdsLab Event SDK -->
<script>
(function(w,k){w._adslab=k;var s=document.createElement('script');
s.async=1;s.src='${origin}/sdk.js?k='+k;
document.head.appendChild(s);})(window,'${siteKey}');
</script>`;

  return NextResponse.json({ siteKey, snippet, origin });
}

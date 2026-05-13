import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

/**
 * GET /api/meta/geo-search?tenantSlug=<slug>&q=<query>
 *
 * Search Meta's geo database for countries / regions / cities matching
 * the query. Backs the location picker in the campaign-builder wizard.
 *
 * Result shape mirrors Meta's targeting payload — caller can put items
 * straight into `targeting.geo_locations.{cities|regions|countries}`.
 */

type RawGeo = {
  key: string;
  name: string;
  type: "country" | "region" | "city" | "zip" | "geo_market";
  country_code?: string;
  country_name?: string;
  region?: string;
  supports_region?: boolean;
  supports_city?: boolean;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const q = url.searchParams.get("q");
  if (!tenantSlug || !q || q.trim().length < 2) {
    return NextResponse.json({ matches: [] });
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection) return NextResponse.json({ matches: [] });
  const accessToken = await getFreshAccessToken(connection);

  try {
    const res = await graphFetch<{ data: RawGeo[] }>(`/search`, {
      accessToken,
      searchParams: {
        type: "adgeolocation",
        q: q.trim(),
        location_types: '["country","region","city"]',
        limit: 15,
      },
    });
    const matches = res.data.map((m) => ({
      key: m.key,
      name: m.name,
      type: m.type,
      countryCode: m.country_code,
      countryName: m.country_name,
      region: m.region,
    }));
    return NextResponse.json({ matches });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}

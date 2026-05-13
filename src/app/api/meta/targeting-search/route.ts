import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import {
  searchInterestSuggestions,
  searchTargeting,
} from "@/lib/meta/targeting-search";

/**
 * GET /api/meta/targeting-search?tenantSlug=<slug>&q=<query>&type=interest
 *
 * Autocomplete for the wizard's targeting fields. Cached 24h per query.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const type = url.searchParams.get("type") ?? "interest";
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  try {
    if (type === "interest-suggestion") {
      // Seeded suggestion mode — caller passes &seeds=Fashion,Beauty (CSV
      // of interest names). Returns related interests Meta thinks would
      // pair well with the seeds.
      const seedsParam = url.searchParams.get("seeds");
      if (!seedsParam) {
        return NextResponse.json({ matches: [] });
      }
      const seedNames = seedsParam.split(",").map((s) => s.trim()).filter(Boolean);
      const matches = await searchInterestSuggestions(tenant.id, seedNames);
      return NextResponse.json({ matches });
    }

    if (type === "interest") {
      const q = url.searchParams.get("q");
      if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
      const matches = await searchTargeting(tenant.id, "adinterest", q);
      return NextResponse.json({ matches });
    }

    return NextResponse.json(
      { error: "type must be 'interest' or 'interest-suggestion'" },
      { status: 400 },
    );
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}

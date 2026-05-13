import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";
import type { MetaPagedResponse } from "./types";

/**
 * Custom + Lookalike + Pixel-based audiences a tenant has set up in
 * Meta. Stage 3 lets users PICK from these; Stage 4 will let them CREATE
 * new ones.
 *
 * Cached for 1 hour in MetaInsightCache (reused — it's a generic JSON
 * blob cache keyed by tenant + scope + rangeKey).
 */

const CACHE_TTL_SEC = 60 * 60;

export type AudienceSummary = {
  id: string;
  name: string;
  /** Meta subtype: CUSTOM, WEBSITE (pixel), LOOKALIKE, ENGAGEMENT, APP, ... */
  subtype: string;
  approximateCount: number | null;
  description: string | null;
};

type RawAudience = {
  id: string;
  name: string;
  subtype?: string;
  approximate_count?: number;
  description?: string;
};

export async function listAudiences(
  tenantId: string,
  metaAccountId: string,
): Promise<AudienceSummary[]> {
  // Cache key — same MetaInsightCache table, distinct scope namespace.
  const scope = `audiences:${metaAccountId}`;
  const rangeKey = "all";

  const cached = await prisma.metaInsightCache.findUnique({
    where: { tenantId_scope_rangeKey: { tenantId, scope, rangeKey } },
  });
  if (cached && cached.expiresAt.getTime() > Date.now()) {
    return cached.payload as unknown as AudienceSummary[];
  }

  // Need an access token to call Meta.
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
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
  if (!connection) throw new Error("No Meta connection");
  const accessToken = await getFreshAccessToken(connection);

  // Fetch all audiences for this ad account.
  const audiences: RawAudience[] = [];
  let page = await graphFetch<MetaPagedResponse<RawAudience>>(
    `/${metaAccountId}/customaudiences`,
    {
      accessToken,
      searchParams: {
        fields: "id,name,subtype,approximate_count,description",
        limit: 100,
      },
    },
  );
  audiences.push(...page.data);
  while (page.paging?.next) {
    const res = await fetch(page.paging.next);
    if (!res.ok) break;
    page = (await res.json()) as MetaPagedResponse<RawAudience>;
    audiences.push(...page.data);
  }

  const result: AudienceSummary[] = audiences.map((a) => ({
    id: a.id,
    name: a.name,
    subtype: a.subtype ?? "UNKNOWN",
    approximateCount: a.approximate_count ?? null,
    description: a.description ?? null,
  }));

  const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000);
  await prisma.metaInsightCache.upsert({
    where: { tenantId_scope_rangeKey: { tenantId, scope, rangeKey } },
    update: { payload: result as unknown as object, fetchedAt: new Date(), expiresAt },
    create: {
      tenantId,
      scope,
      rangeKey,
      payload: result as unknown as object,
      expiresAt,
    },
  });

  return result;
}

import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";

/**
 * Meta's targeting search API — used by the campaign-builder wizard to
 * autocomplete interests, behaviors, demographics.
 *
 * Endpoint: /search?type=adinterest&q=<query>
 * Other types: adworkemployer, adworkposition, education_majors,
 * education_schools, adgeolocation, etc. — we support `adinterest` only
 * in v1; the field set extends naturally.
 */

const CACHE_TTL_SEC = 24 * 60 * 60;
const MAX_RESULTS = 25;

export type TargetingMatch = {
  /** Meta's identifier (used in targeting payload `interests: [{ id, name }]`) */
  id: string;
  name: string;
  /** Human-readable category — Meta returns paths like "Interests > Beauty" */
  path?: string[];
  /** Approximate audience size (some types only) */
  audienceSize?: number;
};

type RawMatch = {
  id: string;
  name: string;
  path?: string[];
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
};

/**
 * Like Facebook Ads Manager's "Suggestions" section — given seed interests,
 * return related ones. Powers the "ความสนใจที่เกี่ยวข้อง" row in the
 * InterestPicker so users don't have to brainstorm every keyword.
 *
 * Meta endpoint: /search?type=adinterestsuggestion
 *   - `interest_list`: JSON-encoded array of seed interest NAMES (not ids)
 */
export async function searchInterestSuggestions(
  tenantId: string,
  seedNames: string[],
): Promise<TargetingMatch[]> {
  if (seedNames.length === 0) return [];

  // Cache by sorted seed list so equivalent seed sets share results.
  const cacheKey = [...seedNames].sort().join("|").toLowerCase().slice(0, 100);
  const scope = "interest-suggestions";
  const cached = await prisma.metaInsightCache.findUnique({
    where: { tenantId_scope_rangeKey: { tenantId, scope, rangeKey: cacheKey } },
  });
  if (cached && cached.expiresAt.getTime() > Date.now()) {
    return cached.payload as unknown as TargetingMatch[];
  }

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

  const res = await graphFetch<{ data: RawMatch[] }>(`/search`, {
    accessToken,
    searchParams: {
      type: "adinterestsuggestion",
      interest_list: JSON.stringify(seedNames),
      limit: 25,
    },
  });

  const matches: TargetingMatch[] = res.data.map((m) => ({
    id: m.id,
    name: m.name,
    path: m.path,
    audienceSize:
      m.audience_size_lower_bound && m.audience_size_upper_bound
        ? Math.round((m.audience_size_lower_bound + m.audience_size_upper_bound) / 2)
        : undefined,
  }));

  await prisma.metaInsightCache.upsert({
    where: { tenantId_scope_rangeKey: { tenantId, scope, rangeKey: cacheKey } },
    update: {
      payload: matches as unknown as object,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + CACHE_TTL_SEC * 1000),
    },
    create: {
      tenantId,
      scope,
      rangeKey: cacheKey,
      payload: matches as unknown as object,
      expiresAt: new Date(Date.now() + CACHE_TTL_SEC * 1000),
    },
  });

  return matches;
}

export async function searchTargeting(
  tenantId: string,
  type: "adinterest",
  query: string,
): Promise<TargetingMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const scope = `targeting-search:${type}`;
  const rangeKey = trimmed.toLowerCase().slice(0, 100);
  const cached = await prisma.metaInsightCache.findUnique({
    where: { tenantId_scope_rangeKey: { tenantId, scope, rangeKey } },
  });
  if (cached && cached.expiresAt.getTime() > Date.now()) {
    return cached.payload as unknown as TargetingMatch[];
  }

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

  const res = await graphFetch<{ data: RawMatch[] }>(`/search`, {
    accessToken,
    searchParams: { type, q: trimmed, limit: MAX_RESULTS },
  });

  const matches: TargetingMatch[] = res.data.map((m) => ({
    id: m.id,
    name: m.name,
    path: m.path,
    audienceSize:
      m.audience_size_lower_bound && m.audience_size_upper_bound
        ? Math.round((m.audience_size_lower_bound + m.audience_size_upper_bound) / 2)
        : undefined,
  }));

  await prisma.metaInsightCache.upsert({
    where: { tenantId_scope_rangeKey: { tenantId, scope, rangeKey } },
    update: {
      payload: matches as unknown as object,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + CACHE_TTL_SEC * 1000),
    },
    create: {
      tenantId,
      scope,
      rangeKey,
      payload: matches as unknown as object,
      expiresAt: new Date(Date.now() + CACHE_TTL_SEC * 1000),
    },
  });

  return matches;
}

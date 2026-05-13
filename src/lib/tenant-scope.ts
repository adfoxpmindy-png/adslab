import { prisma } from "@/lib/prisma";
import { getSelectedAccountIds } from "@/lib/account-preference";

/**
 * Tenant-level default scope. Defines which ad accounts + campaigns
 * the tenant is "supposed to" manage. The effective scope a user sees
 * = tenant scope ∩ user override.
 */

export type TenantScope = {
  accountIds: string[] | null;   // null = no constraint
  campaignIds: string[] | null;
  campaignNamePatterns: CampaignNamePattern[];
};

export type CampaignNamePattern = {
  pattern: string;
  kind: "contains" | "starts_with" | "regex";
  caseInsensitive?: boolean;
};

export type EffectiveScope = {
  accountIds: string[] | null;
  campaignIds: string[] | null;
};

export async function getTenantScope(tenantId: string): Promise<TenantScope> {
  const row = await prisma.tenantScope.findUnique({
    where: { tenantId },
    select: { accountIds: true, campaignIds: true, campaignNamePatterns: true },
  });
  return {
    accountIds: jsonToStringArray(row?.accountIds),
    campaignIds: jsonToStringArray(row?.campaignIds),
    campaignNamePatterns: jsonToPatterns(row?.campaignNamePatterns),
  };
}

export async function setTenantScope(
  tenantId: string,
  scope: TenantScope,
): Promise<void> {
  await prisma.tenantScope.upsert({
    where: { tenantId },
    update: {
      accountIds: (scope.accountIds as unknown) as never,
      campaignIds: (scope.campaignIds as unknown) as never,
      campaignNamePatterns: (scope.campaignNamePatterns as unknown) as never,
    },
    create: {
      tenantId,
      accountIds: (scope.accountIds as unknown) as never,
      campaignIds: (scope.campaignIds as unknown) as never,
      campaignNamePatterns: (scope.campaignNamePatterns as unknown) as never,
    },
  });
}

/**
 * Expand campaign-name patterns to the set of campaign IDs they match
 * right now. Hits the DB to enumerate MetaCampaign rows whose name
 * matches at least one pattern.
 *
 * Only campaigns belonging to the tenant's connection are considered.
 * If `restrictToAccountIds` is provided, the result is further narrowed
 * to campaigns in those accounts (avoids picking up name matches from
 * out-of-scope accounts).
 */
export async function expandCampaignPatterns(
  tenantId: string,
  patterns: CampaignNamePattern[],
  restrictToAccountIds: string[] | null,
): Promise<string[]> {
  if (patterns.length === 0) return [];

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: { id: true },
  });
  if (!connection) return [];

  // Build Prisma OR conditions from patterns
  const whereOr = patterns
    .map((p) => buildNameWhere(p))
    .filter((w): w is Record<string, unknown> => w !== null);
  if (whereOr.length === 0) return [];

  const campaigns = await prisma.metaCampaign.findMany({
    where: {
      metaConnectionId: connection.id,
      ...(restrictToAccountIds !== null
        ? { metaAccountId: { in: restrictToAccountIds } }
        : {}),
      OR: whereOr,
    },
    select: { metaCampaignId: true },
  });
  return campaigns.map((c) => c.metaCampaignId);
}

function buildNameWhere(p: CampaignNamePattern): Record<string, unknown> | null {
  const mode = p.caseInsensitive === false ? "default" : "insensitive";
  switch (p.kind) {
    case "contains":
      return { name: { contains: p.pattern, mode } };
    case "starts_with":
      return { name: { startsWith: p.pattern, mode } };
    case "regex":
      // Prisma's `mode: insensitive` doesn't apply to raw regex; we use
      // string contains as a coarser fallback when regex isn't natively
      // supported by the connector. Postgres supports `~` operator but
      // not via Prisma's filter API directly — fall back to contains.
      return { name: { contains: p.pattern, mode } };
  }
}

/**
 * Merge tenant default scope with the calling user's personal override.
 *
 *   - tenant.accountIds = null AND user.override = null → no filter (all)
 *   - tenant.accountIds = [a,b,c] AND user.override = null → [a,b,c]
 *   - tenant.accountIds = null AND user.override = [a,b] → [a,b]
 *   - tenant.accountIds = [a,b,c] AND user.override = [b,d] → [b]
 *     (intersection; "d" is excluded because tenant scope doesn't include it)
 */
export async function getEffectiveScope(
  userId: string,
  tenantId: string,
): Promise<EffectiveScope> {
  const [tenant, userOverride] = await Promise.all([
    getTenantScope(tenantId),
    getSelectedAccountIds(userId, tenantId),
  ]);
  const accountIds = intersectOrPick(tenant.accountIds, userOverride);

  // Expand campaign-name patterns to concrete IDs and union with the
  // explicit `campaignIds` list. If both are null/empty → no campaign
  // constraint (= all campaigns within selected accounts).
  let campaignIds: string[] | null = tenant.campaignIds;
  if (tenant.campaignNamePatterns.length > 0) {
    const matched = await expandCampaignPatterns(
      tenantId,
      tenant.campaignNamePatterns,
      accountIds,
    );
    if (tenant.campaignIds === null) {
      // Only patterns drive the campaign set
      campaignIds = uniqueStrings(matched);
    } else {
      campaignIds = uniqueStrings([...tenant.campaignIds, ...matched]);
    }
  }

  return { accountIds, campaignIds };
}

function uniqueStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * Prisma where-fragment builder for the typical
 * `metaAccountId` + `metaCampaignId` filter pattern. Use like:
 *
 *   prisma.metaCampaign.findMany({
 *     where: {
 *       metaConnectionId: connectionId,
 *       ...applyScopeFilter(scope),
 *     },
 *   });
 */
export function applyScopeFilter(scope: EffectiveScope): {
  metaAccountId?: { in: string[] };
  metaCampaignId?: { in: string[] };
} {
  const out: { metaAccountId?: { in: string[] }; metaCampaignId?: { in: string[] } } = {};
  if (scope.accountIds !== null) out.metaAccountId = { in: scope.accountIds };
  if (scope.campaignIds !== null) out.metaCampaignId = { in: scope.campaignIds };
  return out;
}

// ---- internals ----

function jsonToStringArray(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string");
}

function jsonToPatterns(v: unknown): CampaignNamePattern[] {
  if (!Array.isArray(v)) return [];
  const out: CampaignNamePattern[] = [];
  for (const item of v) {
    if (
      item &&
      typeof item === "object" &&
      "pattern" in item &&
      "kind" in item &&
      typeof (item as Record<string, unknown>).pattern === "string"
    ) {
      const obj = item as Record<string, unknown>;
      const kind = obj.kind;
      if (kind === "contains" || kind === "starts_with" || kind === "regex") {
        out.push({
          pattern: obj.pattern as string,
          kind,
          caseInsensitive: obj.caseInsensitive === false ? false : true,
        });
      }
    }
  }
  return out;
}

function intersectOrPick(
  a: string[] | null,
  b: string[] | null,
): string[] | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

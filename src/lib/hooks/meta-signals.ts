/**
 * Hook Lab v2 — fetch Meta's own opportunity / anomaly signals for a
 * campaign. These are surfaced next to the winner list so the user sees
 * both "here's your best-performing ad" and "here's what Meta itself
 * flagged as needing attention."
 *
 * MCP tools used (verified against docs/meta-api-mcp-catalog.json):
 *   - insights_anomaly_signal   (per campaign_id)
 *   - insights_opportunity_score (per ad_account_id, account-level)
 *   - campaign_opportunity_score (per campaign_id)
 *
 * All three failure modes are handled gracefully — one tool failing does
 * not prevent the others from returning partial data. The route wrapper
 * enforces a 15s wall-time cap.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";
import { callTool } from "@/lib/meta-mcp/router";

export interface MetaSignalAnomaly {
  metric: string;
  severity?: string;
  direction?: string;
  timestamp?: string;
  expectedRange?: unknown;
}

export interface MetaSignalOpportunity {
  score: number | null;
  recommendations: Array<{
    type?: string;
    severity?: string;
    recommendation?: string;
  }>;
}

export interface MetaSignalsResult {
  anomalies: MetaSignalAnomaly[];
  opportunityScore: MetaSignalOpportunity | null;
  accountOpportunityScore: MetaSignalOpportunity | null;
  warnings: string[];
}

const WALL_TIME_MS = 15_000;

export async function fetchMetaSignals(
  tenantId: string,
  metaCampaignId: string,
): Promise<MetaSignalsResult> {
  const warnings: string[] = [];
  const deadline = Date.now() + WALL_TIME_MS;

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: {
      accessTokenEncrypted: true,
      status: true,
      adAccounts: {
        select: { metaAccountId: true, accountStatus: true },
        orderBy: { accountStatus: "asc" },
        take: 1,
      },
    },
  });

  if (!connection || connection.status !== "ACTIVE") {
    return {
      anomalies: [],
      opportunityScore: null,
      accountOpportunityScore: null,
      warnings: ["mcp_not_connected"],
    };
  }

  const token = decrypt(connection.accessTokenEncrypted);
  const adAccountId = connection.adAccounts[0]?.metaAccountId ?? null;

  // Fire all three in parallel; each is independent and failure of one
  // must not block the others. Also race against the wall-time deadline
  // so a slow Meta response can't hold the request open.
  const [anomalyRes, campaignOpsRes, accountOpsRes] = await Promise.allSettled([
    withDeadline(
      callTool<{ data?: MetaSignalAnomaly[] }>(
        "insights_anomaly_signal",
        {
          object_id: metaCampaignId,
          metric: JSON.stringify(["spend", "cpm", "cpc", "ctr", "conversions"]),
          date_preset: "last_14d",
        },
        token,
      ),
      deadline,
    ),
    withDeadline(
      callTool<{
        data?: Array<{ score?: number; opportunity_types?: unknown }>;
        score?: number;
        opportunity_types?: unknown;
      }>(
        "campaign_opportunity_score",
        {
          campaign_id: metaCampaignId,
          fields: "score,opportunity_types,recommendations",
        },
        token,
      ),
      deadline,
    ),
    adAccountId
      ? withDeadline(
          callTool<{
            data?: Array<{ score?: number; recommendations?: unknown; potential_lift?: unknown }>;
            score?: number;
            recommendations?: unknown;
          }>(
            "insights_opportunity_score",
            {
              ad_account_id: adAccountId,
              fields: "score,recommendations,potential_lift",
              level: "campaign",
            },
            token,
          ),
          deadline,
        )
      : Promise.resolve(null),
  ]);

  const anomalies = collectAnomalies(anomalyRes, warnings);
  const opportunityScore = collectOpportunity(campaignOpsRes, warnings, "campaign_opportunity_score");
  const accountOpportunityScore = collectOpportunity(
    accountOpsRes,
    warnings,
    "insights_opportunity_score",
  );

  return {
    anomalies,
    opportunityScore,
    accountOpportunityScore,
    warnings,
  };
}

// ------------------------------------------------------------
// Collectors — each swallows shape / API errors so partial data flows.
// ------------------------------------------------------------

function collectAnomalies(
  settled: PromiseSettledResult<Awaited<ReturnType<typeof callTool>> | null>,
  warnings: string[],
): MetaSignalAnomaly[] {
  if (settled.status === "rejected") {
    warnings.push("anomaly_signal_failed");
    return [];
  }
  const res = settled.value;
  if (!res) return [];
  if (!res.ok) {
    warnings.push(res.error.toLowerCase().includes("rate") ? "rate_limited" : "anomaly_signal_failed");
    return [];
  }
  const data = res.data as { data?: MetaSignalAnomaly[] };
  const rows = data?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      metric: typeof r?.metric === "string" ? r.metric : "unknown",
      severity: typeof r?.severity === "string" ? r.severity : undefined,
      direction: typeof r?.direction === "string" ? r.direction : undefined,
      timestamp: typeof r?.timestamp === "string" ? r.timestamp : undefined,
      expectedRange: r?.expectedRange,
    }))
    .slice(0, 20);
}

function collectOpportunity(
  settled: PromiseSettledResult<Awaited<ReturnType<typeof callTool>> | null>,
  warnings: string[],
  toolName: string,
): MetaSignalOpportunity | null {
  if (settled.status === "rejected") {
    warnings.push(`${toolName}_failed`);
    return null;
  }
  const res = settled.value;
  if (!res) return null;
  if (!res.ok) {
    warnings.push(res.error.toLowerCase().includes("rate") ? "rate_limited" : `${toolName}_failed`);
    return null;
  }

  const raw = res.data as {
    data?: Array<{ score?: number; opportunity_types?: unknown; recommendations?: unknown }>;
    score?: number;
    opportunity_types?: unknown;
    recommendations?: unknown;
  };
  const first = raw?.data?.[0] ?? raw;
  const score = typeof first?.score === "number" ? first.score : null;
  const recsRaw = (first?.opportunity_types ?? first?.recommendations) as unknown;
  const recommendations: MetaSignalOpportunity["recommendations"] = Array.isArray(recsRaw)
    ? (recsRaw as Array<Record<string, unknown>>).slice(0, 20).map((r) => ({
        type: typeof r?.type === "string" ? r.type : undefined,
        severity: typeof r?.severity === "string" ? r.severity : undefined,
        recommendation:
          typeof r?.recommendation === "string"
            ? r.recommendation
            : typeof r?.description === "string"
              ? (r.description as string)
              : undefined,
      }))
    : [];

  if (score === null && recommendations.length === 0) return null;

  return { score, recommendations };
}

// ------------------------------------------------------------
// Deadline helper — races the wrapped promise against a fixed timeout.
// ------------------------------------------------------------

async function withDeadline<T>(
  promise: Promise<T>,
  deadline: number,
): Promise<T | null> {
  const remaining = Math.max(0, deadline - Date.now());
  if (remaining === 0) return null;
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), remaining);
  });
  return Promise.race([promise, timeout]);
}

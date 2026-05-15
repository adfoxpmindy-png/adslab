import { prisma } from "@/lib/prisma";
import { aiChat, getAiModel } from "@/lib/ai/openrouter";
import { getDashboardData } from "@/lib/meta/dashboard-service";
import type { DateRangeKey } from "@/lib/meta/insights";
import { resolveCampaignGoals } from "@/lib/goals/resolver";
import { sendEmail } from "@/lib/email/send";
import { dailyReportEmailTemplate } from "@/lib/email/templates/daily-report";
import { applyScopeFilter, type ScopeFilter } from "./scope-filter";
import { extractAndValidateActions, stripActionsBlock } from "./extract-actions";

import {
  DAILY_REPORT_SYSTEM_PROMPT,
  buildDailyReportUserMessage,
} from "./prompt";
import { fetchReportKnowledge, renderKnowledgeForPrompt } from "./knowledge-injection";
import {
  captureRecommendation,
  listRecentForTenant,
  renderOutcomesForPrompt,
  type RecommendationActionType,
} from "@/lib/ai/recommendations";

/**
 * Convert a JS Date to the Bangkok-local YYYY-MM-DD date string.
 * Bangkok is UTC+7 — no DST.
 */
function toBangkokDateString(d: Date): string {
  const utcMs = d.getTime();
  const bkk = new Date(utcMs + 7 * 60 * 60 * 1000);
  return bkk.toISOString().slice(0, 10);
}

/** Return midnight UTC of the supplied Bangkok-local date string. */
function bangkokDateToUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function thaiDateLabel(dateStr: string): string {
  // dateStr = "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-").map(Number);
  const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

// Rough cost per 1M tokens for Claude Sonnet 4.6 (input / output / cached input)
const COST_PER_MT_INPUT = 3;
const COST_PER_MT_OUTPUT = 15;
const COST_PER_MT_CACHED = 0.3;

function estimateCostUsd(promptTokens: number, completionTokens: number, cachedTokens: number): number {
  const nonCachedInput = Math.max(0, promptTokens - cachedTokens);
  const cost =
    (nonCachedInput * COST_PER_MT_INPUT) / 1_000_000 +
    (cachedTokens * COST_PER_MT_CACHED) / 1_000_000 +
    (completionTokens * COST_PER_MT_OUTPUT) / 1_000_000;
  return Number(cost.toFixed(6));
}

export type GenerateInput = {
  tenantId: string;
  /** Bangkok-local date the report covers. Default = yesterday. */
  reportDate?: string; // YYYY-MM-DD
  /** Set to userId when manually triggered; null/undefined when cron. */
  generatedBy?: string | null;
  /** Whether to also email the report after generation. */
  sendEmail?: boolean;
  /**
   * Optional scope: if set, the report is filtered to only the
   * accounts/campaigns in this scope. The scope row provides both the
   * filter and the display name for the prompt.
   */
  scopeId?: string | null;
};

export type GenerateResult =
  | { status: "completed"; reportId: string }
  | { status: "skipped"; reportId: string; reason: "already_exists" }
  | { status: "failed"; reportId: string | null; error: string };

export async function generateDailyReport(input: GenerateInput): Promise<GenerateResult> {
  const reportDateStr =
    input.reportDate ?? toBangkokDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const reportDate = bangkokDateToUtcMidnight(reportDateStr);

  // 1. Idempotency check — each (tenant, date, scope) gets one row.
  //    Note: Prisma's composite-unique typing doesn't accept null on
  //    nullable columns, so we use findFirst with an explicit
  //    `scopeId: null` clause for the full-tenant case.
  const scopeId = input.scopeId ?? null;
  const existing = await prisma.dailyReport.findFirst({
    where: { tenantId: input.tenantId, reportDate, scopeId },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "FAILED") {
    return { status: "skipped", reportId: existing.id, reason: "already_exists" };
  }

  // 2. Fetch tenant + connection data + insights snapshot
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      metaConnection: { select: { id: true, status: true } },
      members: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true, name: true } } },
        take: 1,
      },
    },
  });
  if (!tenant) {
    return { status: "failed", reportId: existing?.id ?? null, error: "Tenant not found" };
  }
  if (!tenant.metaConnection || tenant.metaConnection.status !== "ACTIVE") {
    return {
      status: "failed",
      reportId: existing?.id ?? null,
      error: "Tenant has no active Meta connection",
    };
  }

  // 2b. Load scope (if any) so we can both filter the data AND pass the
  //     scope name to the prompt for human-readable framing.
  const scope = scopeId
    ? await prisma.reportScope.findFirst({
        where: { id: scopeId, tenantId: input.tenantId },
        select: { id: true, name: true, accountIds: true, campaignIds: true },
      })
    : null;
  if (scopeId && !scope) {
    return { status: "failed", reportId: null, error: "Scope not found" };
  }

  // 2c. If no explicit ReportScope, fall back to TenantScope as the
  //     implicit filter — that's the "tenant default lens" set in
  //     Settings → Tenant Scope. Without this fallback, the cron-
  //     generated daily report would include data from accounts the
  //     user has scoped out, leading to misleading AI analysis.
  //
  //     Precedence: explicit ReportScope > TenantScope > full tenant
  const tenantScope = scope ? null : await prisma.tenantScope.findUnique({
    where: { tenantId: input.tenantId },
    select: { accountIds: true, campaignIds: true },
  });

  // 3. Create / reset the report row in GENERATING state. We can't use
  //    a single Prisma upsert here because the composite-unique with a
  //    nullable column isn't accepted by the upsert type; do it as a
  //    find+update / create instead.
  const row = existing
    ? await prisma.dailyReport.update({
        where: { id: existing.id },
        data: {
          status: "GENERATING",
          contentMd: null,
          generationError: null,
          generatedBy: input.generatedBy ?? null,
          generatedAt: new Date(),
        },
      })
    : await prisma.dailyReport.create({
        data: {
          tenantId: input.tenantId,
          reportDate,
          scopeId,
          status: "GENERATING",
          generatedBy: input.generatedBy ?? null,
        },
      });

  try {
    // 4. Pull insights for "yesterday" + day-before (for comparison)
    const today = await getDashboardData(input.tenantId, dateRangeForDate(reportDateStr));
    const prevDateStr = shiftBkkDate(reportDateStr, -1);
    let prevDay = null;
    try {
      const prev = await getDashboardData(input.tenantId, dateRangeForDate(prevDateStr));
      prevDay = prev.payload;
    } catch {
      // Previous-day data is optional context — failing it shouldn't kill the report.
    }

    // 4a. Apply scope filter (if any) — reduces both today's and the
    //     comparison day's data to the selected accounts/campaigns.
    //
    // Precedence: explicit ReportScope (named) > TenantScope (default)
    //             > full tenant
    let scopeFilter: ScopeFilter | null = null;
    if (scope) {
      scopeFilter = {
        accountIds: scope.accountIds as string[],
        campaignIds: scope.campaignIds as string[],
      };
    } else if (tenantScope) {
      const tAccounts = tenantScope.accountIds as string[] | null;
      const tCampaigns = tenantScope.campaignIds as string[] | null;
      // Only build a filter if at least one side is set — pure null/null
      // = "no constraint" = same as no filter at all.
      if (tAccounts !== null || tCampaigns !== null) {
        scopeFilter = {
          accountIds: tAccounts ?? [],
          campaignIds: tCampaigns ?? [],
        };
      }
    }
    const todayPayload = scopeFilter ? applyScopeFilter(today.payload, scopeFilter) : today.payload;
    const prevDayPayload =
      prevDay && scopeFilter ? applyScopeFilter(prevDay, scopeFilter) : prevDay;

    // 4b. Resolve goals for every campaign we saw today. This gives the
    //     AI the per-campaign intent it needs to apply the right rubric.
    const allCampaigns = todayPayload.accounts.flatMap((a) =>
      a.campaigns.map((c) => ({
        metaCampaignId: c.campaignId,
        name: c.campaignName,
        metaObjective: c.metaObjective,
      })),
    );
    const goalsByCampaignId = await resolveCampaignGoals({
      tenantId: input.tenantId,
      campaigns: allCampaigns,
    });

    // 5. Build prompt + call Claude
    let userMessage = buildDailyReportUserMessage({
      tenantName: tenant.name,
      dateLabel: thaiDateLabel(reportDateStr),
      today: todayPayload,
      prevDay: prevDayPayload,
      goalsByCampaignId,
      scopeName: scope?.name ?? null,
    });

    // Ground recommendations in expert knowledge (Nick Theriot + Nattawut
    // Puphet via system RAG). Best-effort — if knowledge base is empty,
    // the report just won't carry citations.
    try {
      const knowledge = await fetchReportKnowledge(input.tenantId, {
        totalSpend: todayPayload.summary.spendThb,
        totalImpressions: todayPayload.summary.impressions,
        campaignCount: allCampaigns.length,
        awarenessHighCpm:
          todayPayload.summary.cpm > 50 &&
          [...goalsByCampaignId.values()].some((g) => g.objective === "AWARENESS"),
        // No frequency in DashboardSummary — derive a coarse proxy
        // from impressions vs. reach is unavailable here; skip.
        highFrequency: false,
        unresolved: [...goalsByCampaignId.values()].some((g) => !g.resolved),
      });
      const knowledgeBlock = renderKnowledgeForPrompt(knowledge);
      if (knowledgeBlock) userMessage += "\n\n" + knowledgeBlock;
    } catch {
      // Knowledge injection is best-effort — don't fail the report
    }

    // Outcomes feedback: append a summary of recent recommendation
    // outcomes for THIS tenant so the AI biases toward what worked.
    // Best-effort — if the table is empty (new tenant) or the query
    // fails, the report still ships.
    if (process.env.FEATURE_AI_LEARNING !== "off") {
      try {
        const history = await listRecentForTenant(input.tenantId, 10);
        const outcomesBlock = renderOutcomesForPrompt(history);
        if (outcomesBlock) userMessage += "\n\n" + outcomesBlock;
      } catch {
        // No-op
      }
    }

    const result = await aiChat({
      role: "analysis",
      system: DAILY_REPORT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      cacheSystem: true,
      // 4000 covers full-tenant reports (~3K tokens of structured Thai
      // markdown across 7 objective lanes + recs) with headroom; scoped
      // reports finish well under this. At Sonnet's $15/M output that's
      // a ~$0.06 ceiling per report.
      maxTokens: 4000,
    });

    const rawContentMd = result.content;
    const promptTokens = result.usage.promptTokens;
    const completionTokens = result.usage.completionTokens;

    // Extract structured action suggestions BEFORE stripping the block
    // from the displayed markdown. We persist the validated list on the
    // report so the viewer can render an Actions panel without re-parsing.
    const suggestedActions = await extractAndValidateActions(rawContentMd, input.tenantId);
    const contentMd = stripActionsBlock(rawContentMd);

    // Capture each suggested action as an AIRecommendation for the
    // learning loop. Best-effort: capture failures must NOT block the
    // report. The mapping below converts the report's action enum to
    // our internal RecommendationActionType taxonomy.
    for (const a of suggestedActions) {
      let actionType: RecommendationActionType;
      switch (a.action) {
        case "PAUSE":
          actionType = "pause";
          break;
        case "RESUME":
          actionType = "resume";
          break;
        case "SET_BUDGET":
          actionType = "change_budget";
          break;
        case "DUPLICATE":
          actionType = "scale_budget"; // duplicate is for scaling winners
          break;
        default:
          actionType = "other";
      }
      void captureRecommendation({
        tenantId: input.tenantId,
        source: "daily_report",
        actionType,
        targetKind: "campaign",
        targetMetaId: a.metaCampaignId,
        reasoning: a.reason,
        payload: a.params ? (a.params as Record<string, unknown>) : null,
      });
    }
    // OpenRouter doesn't always surface cache_read_input_tokens via the OpenAI
    // SDK; estimate cost assuming half of input was cached after first call.
    const estimatedCachedTokens = Math.round(promptTokens * 0.6);
    const estimatedCostUsd = estimateCostUsd(promptTokens, completionTokens, estimatedCachedTokens);

    // 6. Save the completed report. Snapshot bundles the dashboard
    //    payload AND the goal each campaign was assigned to AT report
    //    time — so a later viewer can explain "this Awareness campaign
    //    was classified as Awareness because Meta said so" even if the
    //    user later edits their goals.
    const goalsSnapshot = Array.from(goalsByCampaignId.entries()).map(
      ([campaignId, g]) => ({
        campaignId,
        objective: g.objective,
        source: g.source,
        resolved: g.resolved,
      }),
    );
    const snapshot = {
      ...todayPayload,
      goals: goalsSnapshot,
      scope: scope ? { id: scope.id, name: scope.name } : null,
    };
    const completed = await prisma.dailyReport.update({
      where: { id: row.id },
      data: {
        status: "COMPLETED",
        contentMd,
        payloadSnapshot: snapshot as unknown as object,
        suggestedActions: (suggestedActions.length > 0
          ? suggestedActions
          : undefined) as unknown as object,
        promptTokens,
        completionTokens,
        estimatedCostUsd,
        generationError: null,
      },
    });

    // 7. Send email if requested
    if (input.sendEmail) {
      const ownerEmail = tenant.members[0]?.user.email;
      const ownerName = tenant.members[0]?.user.name;
      if (ownerEmail && ownerName) {
        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const reportUrl = `${appUrl}/t/${tenant.slug}/reports/${completed.id}`;
        const template = dailyReportEmailTemplate({
          recipientName: ownerName,
          tenantName: tenant.name,
          dateLabel: thaiDateLabel(reportDateStr),
          contentMd,
          reportUrl,
        });
        const sendResult = await sendEmail({
          to: ownerEmail,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        if (sendResult.ok) {
          await prisma.dailyReport.update({
            where: { id: row.id },
            data: { deliveredAt: new Date(), deliveryError: null },
          });
        } else {
          await prisma.dailyReport.update({
            where: { id: row.id },
            data: { deliveryError: sendResult.error },
          });
        }
      } else {
        await prisma.dailyReport.update({
          where: { id: row.id },
          data: { deliveryError: "No OWNER email found for tenant" },
        });
      }
    }

    return { status: "completed", reportId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.dailyReport.update({
      where: { id: row.id },
      data: { status: "FAILED", generationError: message },
    });
    return { status: "failed", reportId: row.id, error: message };
  }
}

/**
 * Pick a `DateRangeKey` for a single calendar date.
 * Meta date presets only cover relative ranges like "yesterday" — for a
 * specific day we encode it as a custom range with both ends equal to
 * the BKK date.
 */
function dateRangeForDate(bkkDate: string): DateRangeKey {
  return `custom:${bkkDate}..${bkkDate}` as DateRangeKey;
}

function shiftBkkDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Iterate every tenant with an active Meta connection and generate
 * their daily report. Designed for the cron endpoint.
 */
export async function generateDailyReportsForAllTenants(reportDateStr?: string) {
  const tenants = await prisma.tenant.findMany({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });

  const results: Array<{ tenantSlug: string; result: GenerateResult }> = [];
  for (const t of tenants) {
    const result = await generateDailyReport({
      tenantId: t.id,
      reportDate: reportDateStr,
      sendEmail: true,
    });
    results.push({ tenantSlug: t.slug, result });
  }
  return results;
}

// Re-export for use in API routes
export { toBangkokDateString };

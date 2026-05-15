/**
 * Orchestrator: enumerate active rules, evaluate, dispatch matched
 * actions, write audit rows. Called per-tenant by the cron tick.
 */
import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

import { evaluateRule, type InsightsSnapshot } from "./evaluator";
import { dispatchAction, type NotifyTargets } from "./actions";
import { wasFiredInLast24h } from "./cooldown";
import type {
  RuleAction,
  RuleCondition,
  RuleRunStatus,
  RuleScope,
} from "./types";

type LoadedRule = {
  id: string;
  tenantId: string;
  name: string;
  condition: RuleCondition;
  action: RuleAction;
  targetIds: string[];
  minIntervalMinutes: number;
  lastEvaluatedAt: Date | null;
};

/**
 * Run the engine for one tenant. Pulls active rules, batches insights
 * by ad account, evaluates each rule against its scope, dispatches
 * actions, writes audit rows.
 */
export async function runTickForTenant(tenantId: string): Promise<{
  evaluated: number;
  fired: number;
  errors: number;
}> {
  const connection = await getConnection(tenantId);
  if (!connection || connection.status !== "ACTIVE") {
    return { evaluated: 0, fired: 0, errors: 0 };
  }
  const accessToken = await getFreshAccessToken(connection);

  // Active rules whose throttle window has elapsed.
  const now = new Date();
  const rulesRaw = await prisma.autoRule.findMany({
    where: { tenantId, enabled: true },
    select: {
      id: true,
      tenantId: true,
      name: true,
      condition: true,
      action: true,
      targetIds: true,
      minIntervalMinutes: true,
      lastEvaluatedAt: true,
    },
  });
  const rules: LoadedRule[] = rulesRaw
    .map((r) => ({
      ...r,
      condition: r.condition as unknown as RuleCondition,
      action: r.action as RuleAction,
    }))
    .filter((r) => shouldEvaluateNow(r.lastEvaluatedAt, r.minIntervalMinutes, now));

  if (rules.length === 0) {
    return { evaluated: 0, fired: 0, errors: 0 };
  }

  // Collect tenant OWNER emails for notify actions (one DB hit, reused).
  const owners = await prisma.tenantMember.findMany({
    where: { tenantId, role: "OWNER" },
    select: { user: { select: { email: true } } },
  });
  const ownerEmails = owners.map((o) => o.user.email).filter(Boolean);
  const notify: NotifyTargets = { ownerEmails };

  let evaluated = 0;
  let fired = 0;
  let errors = 0;

  // Resolve target ids per rule. If targetIds is empty, expand to all
  // entities in scope for the tenant (via our cached MetaCampaign /
  // MetaAdSet tables — no Meta calls).
  for (const rule of rules) {
    const targets = await resolveTargets(rule, connection.id);
    for (const targetId of targets) {
      evaluated++;
      const result = await evaluateOne(rule, targetId, accessToken);
      if (result.actionResult === "fired") fired++;
      if (result.status === "error") errors++;
    }
    // Mark this rule as evaluated regardless of per-target outcome.
    await prisma.autoRule.update({
      where: { id: rule.id },
      data: { lastEvaluatedAt: new Date() },
    });
  }

  return { evaluated, fired, errors };
}

function shouldEvaluateNow(
  lastEval: Date | null,
  intervalMin: number,
  now: Date,
): boolean {
  if (!lastEval) return true;
  const elapsedMin = (now.getTime() - lastEval.getTime()) / 60_000;
  return elapsedMin >= intervalMin;
}

async function resolveTargets(rule: LoadedRule, connectionId: string): Promise<string[]> {
  if (rule.targetIds.length > 0) return rule.targetIds;
  // Empty targets → expand to all in scope under the tenant's connection.
  if (rule.condition.scope === "campaign") {
    const camps = await prisma.metaCampaign.findMany({
      where: { metaConnectionId: connectionId },
      select: { metaCampaignId: true },
    });
    return camps.map((c) => c.metaCampaignId);
  }
  const adsets = await prisma.metaAdSet.findMany({
    where: { campaign: { metaConnectionId: connectionId } },
    select: { metaAdSetId: true },
  });
  return adsets.map((a) => a.metaAdSetId);
}

async function evaluateOne(
  rule: LoadedRule,
  targetId: string,
  accessToken: string,
): Promise<{ status: RuleRunStatus; actionResult: string | null }> {
  // 1. Fetch insights for the target over the rule's window.
  let snapshot: InsightsSnapshot;
  try {
    snapshot = await fetchInsights(targetId, rule.condition.windowHours, accessToken);
  } catch (err) {
    await writeRun({
      ruleId: rule.id,
      targetId,
      metric: rule.condition.metric,
      value: null,
      threshold: rule.condition.value,
      matched: false,
      status: "error",
      actionResult: null,
      errorMessage: orphanOrError(err),
    });
    return { status: "error", actionResult: null };
  }

  // 2. Evaluate.
  const r = evaluateRule(rule.condition, snapshot);
  if (r.status === "skipped_no_data") {
    await writeRun({
      ruleId: rule.id,
      targetId,
      metric: rule.condition.metric,
      value: null,
      threshold: r.threshold,
      matched: false,
      status: "skipped_no_data",
      actionResult: null,
    });
    return { status: "skipped_no_data", actionResult: null };
  }
  if (r.status === "not_matched") {
    await writeRun({
      ruleId: rule.id,
      targetId,
      metric: rule.condition.metric,
      value: r.evaluatedValue,
      threshold: r.threshold,
      matched: false,
      status: "not_matched",
      actionResult: null,
    });
    return { status: "not_matched", actionResult: null };
  }

  // 3. Matched — check cooldown.
  const recentlyFired = await wasFiredInLast24h(rule.id, targetId);
  if (recentlyFired) {
    await writeRun({
      ruleId: rule.id,
      targetId,
      metric: rule.condition.metric,
      value: r.evaluatedValue,
      threshold: r.threshold,
      matched: true,
      status: "matched_in_cooldown",
      actionResult: null,
    });
    return { status: "matched_in_cooldown", actionResult: null };
  }

  // 4. Dispatch the action.
  const reason = renderReason(rule.condition.metric, r.evaluatedValue, r.threshold, rule.condition);
  const dispatchResult = await dispatchAction(
    rule.action,
    {
      tenantId: rule.tenantId,
      ruleId: rule.id,
      ruleName: rule.name,
      targetId,
      reason,
      accessToken,
    },
    await loadNotifyTargets(rule.tenantId),
  );
  await writeRun({
    ruleId: rule.id,
    targetId,
    metric: rule.condition.metric,
    value: r.evaluatedValue,
    threshold: r.threshold,
    matched: true,
    status: "matched",
    actionResult: dispatchResult.result,
    errorMessage: dispatchResult.result === "error" ? dispatchResult.message : undefined,
  });
  if (dispatchResult.result === "fired") {
    await prisma.autoRule.update({
      where: { id: rule.id },
      data: { lastFiredAt: new Date() },
    });
  }
  return { status: "matched", actionResult: dispatchResult.result };
}

const notifyCache = new Map<string, NotifyTargets>();
async function loadNotifyTargets(tenantId: string): Promise<NotifyTargets> {
  const cached = notifyCache.get(tenantId);
  if (cached) return cached;
  const owners = await prisma.tenantMember.findMany({
    where: { tenantId, role: "OWNER" },
    select: { user: { select: { email: true } } },
  });
  const targets = { ownerEmails: owners.map((o) => o.user.email).filter(Boolean) };
  notifyCache.set(tenantId, targets);
  return targets;
}

function renderReason(metric: string, value: number, threshold: number, c: RuleCondition): string {
  const fmt = (n: number) =>
    metric === "ctr" || metric === "roas" ? n.toFixed(3) : n.toFixed(2);
  const opTh = { gt: ">", gte: "≥", lt: "<", lte: "≤" }[c.op];
  return `${metric.toUpperCase()} ${fmt(value)} ${opTh} ${fmt(threshold)} over last ${c.windowHours}h`;
}

function orphanOrError(err: unknown): string {
  const msg = (err as Error).message ?? String(err);
  if (msg.toLowerCase().includes("does not exist")) {
    return `orphan target: ${msg}`;
  }
  return msg;
}

async function writeRun(args: {
  ruleId: string;
  targetId: string;
  metric: string;
  value: number | null;
  threshold: number;
  matched: boolean;
  status: RuleRunStatus;
  actionResult: string | null;
  errorMessage?: string;
}) {
  await prisma.autoRuleRun.create({
    data: {
      ruleId: args.ruleId,
      targetId: args.targetId,
      evaluatedMetric: args.metric,
      evaluatedValue: args.value,
      threshold: args.threshold,
      matched: args.matched,
      status: args.status,
      actionResult: args.actionResult,
      errorMessage: args.errorMessage,
    },
  });
}

/**
 * Pull insights for one Meta entity (campaign or adset id) over the
 * past `windowHours`. Meta computes insights in 1-hour buckets so we
 * use `time_increment=hourly` and sum manually. For longer windows
 * (6h, 24h) this gives accurate aggregates without firing many calls.
 */
async function fetchInsights(
  entityId: string,
  windowHours: number,
  accessToken: string,
): Promise<InsightsSnapshot> {
  const until = new Date();
  const since = new Date(until.getTime() - windowHours * 60 * 60_000);
  type RawRow = {
    spend?: string;
    impressions?: string;
    reach?: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
    inline_link_clicks?: string;
  };
  const r = await graphFetch<{ data?: RawRow[] }>(`/${entityId}/insights`, {
    accessToken,
    searchParams: {
      fields: "spend,impressions,reach,actions,action_values,inline_link_clicks",
      time_range: JSON.stringify({
        since: since.toISOString().slice(0, 10),
        until: until.toISOString().slice(0, 10),
      }),
      time_increment: "all_days",
    },
  });
  const row = r.data?.[0] ?? {};
  const sumAction = (
    arr: Array<{ action_type: string; value: string }> | undefined,
    types: string[],
  ): number => {
    if (!arr) return 0;
    return arr
      .filter((a) => types.includes(a.action_type))
      .reduce((s, a) => s + parseFloat(a.value), 0);
  };
  return {
    spend: parseFloat(row.spend ?? "0"),
    impressions: parseFloat(row.impressions ?? "0"),
    reach: parseFloat(row.reach ?? "0"),
    video_views: sumAction(row.actions, ["video_view", "thruplay"]),
    clicks: parseFloat(row.inline_link_clicks ?? "0"),
    purchase_value: sumAction(row.action_values, ["purchase", "omni_purchase"]),
  };
}

/**
 * Closed-loop AI optimization — capture every concrete recommendation
 * the AI emits, regardless of source (daily-report / chat-tool /
 * rules-suggest), so we can score outcomes 7 days later and feed the
 * data back into future prompts.
 *
 * Reads: listRecentForTenant() — surfaced as context in chat + report.
 * Writes: captureRecommendation() — called from each emission point.
 */
import { prisma } from "@/lib/prisma";

export type RecommendationSource = "daily_report" | "chat_tool" | "rules_suggest";

export type RecommendationActionType =
  | "pause"
  | "resume"
  | "scale_budget"
  | "refresh_creative"
  | "change_budget"
  | "change_targeting"
  | "diagnose"
  | "other";

export type RecommendationTargetKind = "campaign" | "adset" | "ad";

export type CaptureInput = {
  tenantId: string;
  source: RecommendationSource;
  actionType: RecommendationActionType;
  targetKind: RecommendationTargetKind;
  targetMetaId: string;
  reasoning?: string | null;
  payload?: Record<string, unknown> | null;
  createdByUserId?: string | null;
  conversationId?: string | null;
};

/**
 * Persist a recommendation. Best-effort: failure here MUST NOT propagate
 * back to the caller — capture is observability, never the critical
 * path. We swallow errors and log.
 */
export async function captureRecommendation(input: CaptureInput): Promise<void> {
  try {
    await prisma.aIRecommendation.create({
      data: {
        tenantId: input.tenantId,
        source: input.source,
        actionType: input.actionType,
        targetKind: input.targetKind,
        targetMetaId: input.targetMetaId,
        reasoning: input.reasoning ?? null,
        payload: (input.payload ?? null) as never,
        createdByUserId: input.createdByUserId ?? null,
        conversationId: input.conversationId ?? null,
      },
    });
  } catch (err) {
    // Don't break the caller — recommendation capture is observability.
    console.error("[recommendations] capture failed", err);
  }
}

export type RecommendationWithOutcome = {
  id: string;
  source: RecommendationSource;
  actionType: RecommendationActionType;
  targetKind: RecommendationTargetKind;
  targetMetaId: string;
  reasoning: string | null;
  createdAt: string;
  outcome: {
    actionTaken: string;
    kpiDelta: { metric: string; before: number; after: number; percentChange: number } | null;
  } | null;
};

/**
 * Fetch this tenant's most recent recommendations + outcomes for
 * prompt-injection feedback. Includes recs without outcomes (still
 * within the 7-day window) so the AI sees its in-flight advice too.
 */
export async function listRecentForTenant(
  tenantId: string,
  limit = 10,
): Promise<RecommendationWithOutcome[]> {
  const rows = await prisma.aIRecommendation.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { outcome: true },
  });
  return rows.map((r) => ({
    id: r.id,
    source: r.source as RecommendationSource,
    actionType: r.actionType as RecommendationActionType,
    targetKind: r.targetKind as RecommendationTargetKind,
    targetMetaId: r.targetMetaId,
    reasoning: r.reasoning,
    createdAt: r.createdAt.toISOString(),
    outcome: r.outcome
      ? {
          actionTaken: r.outcome.actionTaken,
          kpiDelta: r.outcome.kpiDelta as RecommendationWithOutcome["outcome"] extends infer T
            ? T extends { kpiDelta: infer K }
              ? K
              : never
            : never,
        }
      : null,
  }));
}

/**
 * Render a recent-outcomes summary for prompt injection. Returns "" when
 * the tenant has no history, so the call site can simply concatenate
 * with no conditional.
 */
export function renderOutcomesForPrompt(history: RecommendationWithOutcome[]): string {
  if (history.length === 0) return "";
  const lines: string[] = [];
  lines.push("=== ประวัติคำแนะนำ AI ที่ผ่านมาของ tenant นี้ (ใช้เพื่อปรับ recommendation ครั้งต่อไป — ห้ามอ้างถึงตรง ๆ ในคำตอบ) ===");
  for (const r of history) {
    const summary = `[${r.actionType} → ${r.targetKind} ${r.targetMetaId}]`;
    if (!r.outcome) {
      lines.push(`${summary} ยังไม่ครบ 7 วัน — รอผล`);
      continue;
    }
    const o = r.outcome;
    const k = o.kpiDelta;
    if (o.actionTaken === "target_deleted" || o.actionTaken === "no_data") {
      lines.push(`${summary} ${o.actionTaken}`);
    } else if (k) {
      lines.push(
        `${summary} ${o.actionTaken} → ${k.metric.toUpperCase()} ${k.before.toFixed(2)} → ${k.after.toFixed(2)} (${k.percentChange > 0 ? "+" : ""}${k.percentChange.toFixed(1)}%)`,
      );
    } else {
      lines.push(`${summary} ${o.actionTaken}`);
    }
  }
  lines.push("");
  lines.push("→ ถ้า pattern ที่เห็นว่าได้ผลดีกับ tenant นี้ (positive percent change) แนะนำซ้ำได้. ถ้า ignored บ่อย ให้ปรับ tone หรือเสนอ angle อื่น");
  return lines.join("\n");
}

/**
 * 24-hour-per-rule fire cooldown. Prevents a flapping rule from
 * spamming pauses / emails — once an action fires on a (rule, target)
 * pair it can't fire again for 24h.
 *
 * Implemented as a query against AutoRuleRun rather than a separate
 * tracking table: the audit log is the source of truth.
 */
import { prisma } from "@/lib/prisma";

const COOLDOWN_HOURS = 24;

/**
 * Returns true if this rule fired its action against this target in
 * the last 24 hours. Caller writes a "matched_in_cooldown" run row
 * when this is true.
 */
export async function wasFiredInLast24h(
  ruleId: string,
  targetId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60_000);
  const recent = await prisma.autoRuleRun.findFirst({
    where: {
      ruleId,
      targetId,
      tickAt: { gte: since },
      actionResult: "fired",
    },
    select: { id: true },
  });
  return recent !== null;
}

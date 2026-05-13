import type { GoalObjective } from "@/generated/prisma/enums";

/**
 * A naming rule pre-compiled for matching. Strings are stored lowercase
 * (we always compare case-insensitively); regex objects carry the `i`
 * flag.
 */
export type CompiledRule = {
  matcher: RegExp | string;
  objective: GoalObjective;
};

/**
 * Apply every rule in priority order; return the first match's
 * objective, or null if none matched.
 *
 * Pre-compiled rules are passed in by the resolver so we compile once
 * per resolution, not once per campaign × rule (812 × 30 = thousands).
 */
export function matchNamingRule(
  campaignName: string,
  rules: CompiledRule[],
): GoalObjective | null {
  const haystack = campaignName.toLowerCase();
  for (const r of rules) {
    if (typeof r.matcher === "string") {
      if (haystack.includes(r.matcher)) return r.objective;
    } else if (r.matcher.test(campaignName)) {
      return r.objective;
    }
  }
  return null;
}

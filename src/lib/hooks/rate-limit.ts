/**
 * Per-tenant, per-endpoint daily rate limiter (in-memory, MVP).
 *
 * Keys collapse tenantId+endpoint; buckets reset at Bangkok-local midnight
 * so caps line up with the "per day" cost meter users see in the UI.
 *
 * Known MVP tradeoff (documented as a known_gap in Agent D's report):
 *   - Memory-only → does NOT survive a serverless cold-start.
 *   - Not shared across Vercel regions/instances.
 *   - v2 should back this with Redis/Upstash. The public API of this
 *     module is stable so v2 is a one-file swap.
 */

/** Endpoints Hook Lab throttles. Adding a new endpoint = one enum entry. */
export type HookRateLimitEndpoint =
  | "generate"
  | "iterate"
  | "analyze"
  | "visual"
  | "heuristic";

/** Daily caps per (tenant, endpoint). Numbers per Agent D scope brief. */
export const HOOK_DAILY_CAPS: Record<HookRateLimitEndpoint, number> = {
  generate: 20,
  iterate: 30,
  analyze: 40,
  visual: 30,
  heuristic: 100,
};

type BucketRow = {
  /** Count of successful acquires today (Bangkok-local calendar day). */
  count: number;
  /** Bangkok-local day key, e.g. "2026-08-12". Bucket resets on day flip. */
  dayKey: string;
};

const buckets = new Map<string, BucketRow>();

/**
 * Bangkok-local YYYY-MM-DD. All Hook Lab caps run on BKK day boundaries so
 * users see "reset at midnight" and it matches the cost meter.
 */
function bangkokDayKey(): string {
  const now = new Date();
  // UTC+7 shift (no DST — Thailand does not observe daylight saving).
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = bkk.getUTCFullYear();
  const m = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  const d = String(bkk.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function bucketKey(tenantId: string, endpoint: HookRateLimitEndpoint): string {
  return `${tenantId}::${endpoint}`;
}

export interface RateLimitResult {
  ok: boolean;
  /** Requests already consumed in the current day, AFTER this attempt. */
  used: number;
  /** Cap for the (tenant, endpoint) pair. */
  limit: number;
  /** Remaining requests today. Never negative. */
  remaining: number;
  /** ISO string for when the bucket resets (Bangkok midnight, as UTC). */
  resetsAt: string;
  /** Present only when ok=false. */
  errorMessage?: string;
}

function resetsAtIso(): string {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  // Next Bangkok midnight — bump day forward and zero the time.
  const next = new Date(
    Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() + 1),
  );
  // Convert back to UTC by subtracting the 7h shift we added.
  return new Date(next.getTime() - 7 * 60 * 60 * 1000).toISOString();
}

/**
 * Attempts to consume one request unit. When the cap is hit, returns
 * ok=false and does NOT increment the counter (callers propagate an
 * HTTP 429 to the client).
 */
export function acquireHookRateLimit(
  tenantId: string,
  endpoint: HookRateLimitEndpoint,
): RateLimitResult {
  const limit = HOOK_DAILY_CAPS[endpoint];
  const today = bangkokDayKey();
  const key = bucketKey(tenantId, endpoint);

  const existing = buckets.get(key);
  const row: BucketRow =
    existing && existing.dayKey === today
      ? existing
      : { count: 0, dayKey: today };

  if (row.count >= limit) {
    // Persist row so future callers still see the correct dayKey.
    buckets.set(key, row);
    return {
      ok: false,
      used: row.count,
      limit,
      remaining: 0,
      resetsAt: resetsAtIso(),
      errorMessage: `Hook Lab ${endpoint} daily cap reached (${limit}/day). Try again tomorrow.`,
    };
  }

  row.count += 1;
  buckets.set(key, row);

  return {
    ok: true,
    used: row.count,
    limit,
    remaining: limit - row.count,
    resetsAt: resetsAtIso(),
  };
}

/**
 * Peeks at the current bucket without incrementing. Used by /api/ai/hooks/cost
 * to render the "used X / Y today" chip in the cost meter.
 */
export function peekHookRateLimit(
  tenantId: string,
  endpoint: HookRateLimitEndpoint,
): { used: number; limit: number; remaining: number; resetsAt: string } {
  const limit = HOOK_DAILY_CAPS[endpoint];
  const today = bangkokDayKey();
  const key = bucketKey(tenantId, endpoint);
  const existing = buckets.get(key);
  const count = existing && existing.dayKey === today ? existing.count : 0;
  return {
    used: count,
    limit,
    remaining: Math.max(0, limit - count),
    resetsAt: resetsAtIso(),
  };
}

/** Test / admin helper — reset every bucket for a tenant. Not exposed to users. */
export function _resetHookRateLimitsForTenant(tenantId: string): void {
  for (const key of Array.from(buckets.keys())) {
    if (key.startsWith(`${tenantId}::`)) buckets.delete(key);
  }
}

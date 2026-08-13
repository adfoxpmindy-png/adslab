import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import {
  detectTopWinners,
  getCachedWinners,
} from "@/lib/hooks/meta-detect-winners";
import type { HookWinnerShape } from "@/lib/hooks/types";

/**
 * POST /api/ai/hooks/meta/detect-winners
 *
 * Reviewer tweak #6: this endpoint does NOT run detection synchronously.
 *   1. If HookWinner rows for the tenant are still cached (cachedUntil >
 *      now), return them immediately as a cache hit.
 *   2. Otherwise, schedule detection to run in the background via
 *      next/server after() and return {winners: [], warnings:
 *      ["detection_in_progress"]}. The client polls this endpoint again
 *      after ~10-30s to pick up the freshly cached rows.
 *
 * maxDuration bumped to 300s so the after() callback has room to finish
 * (Meta calls are slow; the 60s per-tenant cap inside detectTopWinners
 * bounds the LLM + retry loop separately).
 */
export const maxDuration = 300;

const BodySchema = z.object({
  tenantSlug: z.string().min(1),
  maxWinners: z.number().int().min(1).max(10).optional(),
  sinceDays: z.number().int().min(1).max(90).optional(),
  force: z.boolean().optional(),
});

export type HookWinnerDetectResult = {
  winners: HookWinnerShape[];
  detectedAt: string | null;
  cachedUntil: string | null;
  warnings: string[];
  fromCache: boolean;
};

export async function POST(request: Request): Promise<Response> {
  await requireSession();

  const parsed = BodySchema.safeParse(await safeJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { tenantSlug, maxWinners, sinceDays, force } = parsed.data;

  const { tenant } = await requireTenantMember(tenantSlug);

  // Step 1 — cache read (skip when caller explicitly forces a refresh).
  if (!force) {
    const cached = await getCachedWinners(tenant.id, maxWinners ?? 3);
    if (cached.length > 0) {
      const first = cached[0];
      const result: HookWinnerDetectResult = {
        winners: cached,
        detectedAt: first.detectedAt,
        cachedUntil: first.cachedUntil,
        warnings: [],
        fromCache: true,
      };
      return NextResponse.json(result);
    }
  }

  // Step 2 — schedule background detection. after() runs post-response
  // on the same invocation (Vercel), so the client gets a fast 202 while
  // detection fills the cache for the next poll.
  const tenantId = tenant.id;
  after(async () => {
    try {
      await detectTopWinners(tenantId, { maxWinners, sinceDays });
    } catch (err) {
      console.error(
        "[api/ai/hooks/meta/detect-winners] background detection failed:",
        (err as Error).message,
      );
    }
  });

  const pending: HookWinnerDetectResult = {
    winners: [],
    detectedAt: null,
    cachedUntil: null,
    warnings: ["detection_in_progress"],
    fromCache: false,
  };
  return NextResponse.json(pending, { status: 202 });
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

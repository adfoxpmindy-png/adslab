/**
 * POST /api/ai/hooks/heuristic-check — combined body-hook alignment +
 * visual-attribute-diff heuristic (fast, non-streaming).
 *
 * Called debounced on typing and synchronously before Save. Returns
 * combinedRisk (LOW/MEDIUM/HIGH) + reasoning + suggestion. HIGH triggers
 * the warn+confirm modal client-side; it is never a hard block.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { guardRateLimit, resolveTenant } from "@/lib/hooks/route-helpers";
import { checkHeuristic } from "@/lib/hooks/service";

const visualDirectionSchema = z.object({
  name: z.string(),
  description: z.string(),
  shotList: z.array(z.string()).default([]),
  hypothesis: z.string().default(""),
  whyDifferent: z.string().default(""),
  format: z
    .enum([
      "ugc_talking_head",
      "split_screen_before_after",
      "on_screen_text_over_product",
      "pov_over_shoulder",
      "unboxing_demo",
      "testimonial_montage",
      "static_text_on_image",
    ])
    .optional(),
  aspectRatio: z.enum(["9:16", "1:1", "4:5"]).optional(),
  durationSec: z.number().nullable().optional(),
});

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  controlHookText: z.string().max(4000).optional(),
  controlBodyText: z.string().max(8000).optional(),
  controlVisualSummary: z.string().max(2000).optional(),
  controlDominantAttributes: z.array(z.string()).max(20).optional(),
  previousWinnerVisualSummaries: z.array(z.string()).max(10).optional(),
  newTextHook: z.string().min(1).max(4000),
  newBody: z.string().max(8000).optional(),
  newVisualDirections: z.array(visualDirectionSchema).max(6).optional(),
  language: z.enum(["th", "en", "both"]).default("both"),
});

export async function POST(request: Request) {
  const auth = await resolveTenant(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const rate = guardRateLimit(ctx.tenant.id, "heuristic");
  if (!rate.ok) return rate.response;

  try {
    const result = await checkHeuristic({
      tenantId: ctx.tenant.id,
      controlHookText: parsed.data.controlHookText,
      controlBodyText: parsed.data.controlBodyText,
      controlVisualSummary: parsed.data.controlVisualSummary,
      controlDominantAttributes: parsed.data.controlDominantAttributes,
      previousWinnerVisualSummaries: parsed.data.previousWinnerVisualSummaries,
      newTextHook: parsed.data.newTextHook,
      newBody: parsed.data.newBody,
      newVisualDirections: parsed.data.newVisualDirections,
      language: parsed.data.language,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hooks/heuristic-check]", err);
    return NextResponse.json({ error: "ai_failure", message }, { status: 502 });
  }
}

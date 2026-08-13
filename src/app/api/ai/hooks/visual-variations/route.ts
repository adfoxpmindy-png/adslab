/**
 * POST /api/ai/hooks/visual-variations — Plan Visuals mode (non-streaming).
 *
 * Given one text hook, propose 3 visual directions from the fixed
 * 7-format taxonomy in VISUAL_PLANNER_PROMPT.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { guardRateLimit, resolveTenant } from "@/lib/hooks/route-helpers";
import { planVisualDirections } from "@/lib/hooks/service";

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  textHook: z.string().min(1).max(4000),
  format: z.enum(["video", "static"]).default("video"),
  aspectRatio: z.enum(["9:16", "1:1", "4:5"]).default("9:16"),
  intent: z.enum(["iteration", "big_swing"]).optional(),
  product: z.string().max(1000).optional(),
  audience: z.string().max(1000).optional(),
  language: z.enum(["th", "en", "both"]).optional(),
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

  const rate = guardRateLimit(ctx.tenant.id, "visual");
  if (!rate.ok) return rate.response;

  try {
    const directions = await planVisualDirections({
      tenantId: ctx.tenant.id,
      userId: ctx.session.userId,
      textHook: parsed.data.textHook,
      format: parsed.data.format,
      aspectRatio: parsed.data.aspectRatio,
      intent: parsed.data.intent,
      product: parsed.data.product,
      audience: parsed.data.audience,
      language: parsed.data.language,
    });
    return NextResponse.json({ ok: true, directions, count: directions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hooks/visual-variations]", err);
    return NextResponse.json({ error: "ai_failure", message }, { status: 502 });
  }
}

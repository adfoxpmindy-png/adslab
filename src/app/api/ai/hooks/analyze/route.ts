/**
 * POST /api/ai/hooks/analyze — Analyze mode (SSE stream).
 *
 * Scores a pasted hook (and optional body) on 3 Golden-Formula axes plus
 * body-hook alignment, and returns heuristic Andromeda risk + 3 rewrites.
 *
 * Reviewer tweak #3: input schema accepts optional {useMetaWinner, metaWinnerId}
 * — if set, load HookWinner row and use it as the control_hook / control_body.
 */

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  guardRateLimit,
  resolveTenant,
  sseStream,
  type SseEvent,
} from "@/lib/hooks/route-helpers";
import { analyzeHook } from "@/lib/hooks/service";

const bodySchema = z
  .object({
    tenantSlug: z.string().min(1),
    textHook: z.string().min(1).max(4000),
    bodyOutline: z.string().max(8000).optional(),
    controlHookText: z.string().max(4000).optional(),
    controlBodyText: z.string().max(8000).optional(),
    imageUrl: z.string().url().optional(),
    product: z.string().max(1000).optional(),
    audience: z.string().max(1000).optional(),
    language: z.enum(["th", "en", "both"]).optional(),
    useMetaWinner: z.boolean().optional(),
    metaWinnerId: z.string().min(1).optional(),
  })
  .refine((v) => !v.useMetaWinner || (v.useMetaWinner && v.metaWinnerId), {
    message: "useMetaWinner requires metaWinnerId",
  });

export async function POST(request: Request) {
  const auth = await resolveTenant(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_input", details: parsed.error.issues }, { status: 400 });
  }

  const rate = guardRateLimit(ctx.tenant.id, "analyze");
  if (!rate.ok) return rate.response;

  let controlHookText = parsed.data.controlHookText;
  let controlBodyText = parsed.data.controlBodyText;

  // Reviewer tweak #3 — resolve control from a Meta-detected winner if requested.
  if (parsed.data.useMetaWinner && parsed.data.metaWinnerId) {
    const winner = await prisma.hookWinner.findFirst({
      where: { id: parsed.data.metaWinnerId, tenantId: ctx.tenant.id },
    });
    if (!winner) {
      return Response.json({ error: "winner_not_found" }, { status: 404 });
    }
    // Meta winner takes precedence over any pasted control text — the user
    // opted in explicitly with useMetaWinner=true.
    controlHookText = winner.textHook;
    controlBodyText = winner.body ?? undefined;
  }

  return sseStream(async function* (): AsyncGenerator<SseEvent> {
    yield { type: "progress", message: "Scoring hook on 3 Golden-Formula axes…" };
    const analysis = await analyzeHook({
      tenantId: ctx.tenant.id,
      userId: ctx.session.userId,
      textHook: parsed.data.textHook,
      bodyOutline: parsed.data.bodyOutline,
      controlHookText,
      controlBodyText,
      imageUrl: parsed.data.imageUrl,
      product: parsed.data.product,
      audience: parsed.data.audience,
      language: parsed.data.language,
    });
    yield { type: "result", analysis };
  });
}

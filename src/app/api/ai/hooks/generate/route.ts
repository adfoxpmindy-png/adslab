/**
 * POST /api/ai/hooks/generate — Generate mode (SSE stream).
 *
 * Drafts 3 big-swing concepts (3 visual directions each) via
 * generateHookConcepts. Streamed via SSE — the underlying LLM call is
 * atomic (we don't have Vercel AI SDK token streaming here), so we emit
 * a progress event before the result and let the client render a spinner.
 */

import { z } from "zod";

import {
  guardRateLimit,
  resolveTenant,
  sseStream,
  type SseEvent,
} from "@/lib/hooks/route-helpers";
import { generateHookConcepts } from "@/lib/hooks/service";

const languageSchema = z.enum(["th", "en", "both"]);

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  product: z.string().min(1).max(1000),
  audience: z.string().min(1).max(1000),
  desire: z.string().min(1).max(1000),
  language: languageSchema.default("both"),
  awarenessStage: z
    .enum(["unaware", "problem", "solution", "product", "most-aware"])
    .optional(),
  sophisticationStage: z.number().int().min(1).max(5).optional(),
  controlHookText: z.string().max(2000).optional(),
  controlBodyText: z.string().max(4000).optional(),
  controlVisualSummary: z.string().max(2000).optional(),
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

  const rate = guardRateLimit(ctx.tenant.id, "generate");
  if (!rate.ok) return rate.response;

  return sseStream(async function* (): AsyncGenerator<SseEvent> {
    yield { type: "progress", message: "Drafting 3 big-swing concepts…" };
    const concepts = await generateHookConcepts({
      tenantId: ctx.tenant.id,
      userId: ctx.session.userId,
      product: parsed.data.product,
      audience: parsed.data.audience,
      desire: parsed.data.desire,
      language: parsed.data.language,
      awarenessStage: parsed.data.awarenessStage,
      sophisticationStage: parsed.data.sophisticationStage,
      controlHookText: parsed.data.controlHookText,
      controlBodyText: parsed.data.controlBodyText,
      controlVisualSummary: parsed.data.controlVisualSummary,
    });
    yield { type: "result", concepts, count: concepts.length };
  });
}

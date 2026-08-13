/**
 * POST /api/ai/hooks/iterate — Iterate mode (SSE stream).
 *
 * Drafts 3–5 single-lever iterations of a winner. Winner text is loaded
 * either from a saved HookConcept, a HookWinner cache row (winnerSource=
 * "meta"), or from pasted text (sanitizer + wrap-as-data applied by
 * service.ts).
 */

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  guardRateLimit,
  resolveTenant,
  sseStream,
  type SseEvent,
} from "@/lib/hooks/route-helpers";
import { generateIterations } from "@/lib/hooks/service";

const leverSchema = z.enum([
  "opening_beat",
  "first_frame",
  "actor_age",
  "actor_ethnicity",
  "format_style",
  "callout_wording",
]);

const bodySchema = z
  .object({
    tenantSlug: z.string().min(1),
    winnerSource: z.enum(["meta", "pasted", "savedConceptId"]),
    winnerTextHook: z.string().max(4000).optional(),
    winnerBody: z.string().max(8000).optional(),
    winnerVisualSummary: z.string().max(2000).optional(),
    winnerDominantAttributes: z.array(z.string().max(80)).max(10).optional(),
    iterationCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    lockedLevers: z.array(leverSchema).optional(),
    language: z.enum(["th", "en", "both"]).default("both"),
    savedConceptId: z.string().min(1).optional(),
    metaWinnerId: z.string().min(1).optional(),
  })
  .refine(
    (v) =>
      (v.winnerSource === "pasted" && v.winnerTextHook && v.winnerBody) ||
      (v.winnerSource === "savedConceptId" && v.savedConceptId) ||
      (v.winnerSource === "meta" && v.metaWinnerId),
    {
      message:
        "pasted → winnerTextHook + winnerBody required; savedConceptId → savedConceptId required; meta → metaWinnerId required",
    },
  );

export async function POST(request: Request) {
  const auth = await resolveTenant(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_input", details: parsed.error.issues }, { status: 400 });
  }

  const rate = guardRateLimit(ctx.tenant.id, "iterate");
  if (!rate.ok) return rate.response;

  let winnerTextHook = parsed.data.winnerTextHook ?? "";
  let winnerBody = parsed.data.winnerBody ?? "";
  let winnerVisualSummary = parsed.data.winnerVisualSummary;
  let winnerDominantAttributes = parsed.data.winnerDominantAttributes;
  let parentConceptId: string | undefined;

  if (parsed.data.winnerSource === "savedConceptId" && parsed.data.savedConceptId) {
    const concept = await prisma.hookConcept.findFirst({
      where: { id: parsed.data.savedConceptId, tenantId: ctx.tenant.id },
    });
    if (!concept) {
      return Response.json({ error: "concept_not_found" }, { status: 404 });
    }
    winnerTextHook = concept.textHookTh ?? concept.textHookEn ?? "";
    winnerBody = concept.bodyOutline ?? "";
    parentConceptId = concept.id;
  } else if (parsed.data.winnerSource === "meta" && parsed.data.metaWinnerId) {
    const winner = await prisma.hookWinner.findFirst({
      where: { id: parsed.data.metaWinnerId, tenantId: ctx.tenant.id },
    });
    if (!winner) {
      return Response.json({ error: "winner_not_found" }, { status: 404 });
    }
    winnerTextHook = winner.textHook;
    winnerBody = winner.body ?? "";
    winnerVisualSummary = winner.visualSummary ?? undefined;
    winnerDominantAttributes = Array.isArray(winner.dominantAttributes)
      ? (winner.dominantAttributes as string[])
      : undefined;
  }

  if (!winnerTextHook || !winnerBody) {
    return Response.json(
      { error: "winner_incomplete", message: "winner hook + body required after resolution" },
      { status: 400 },
    );
  }

  return sseStream(async function* (): AsyncGenerator<SseEvent> {
    yield {
      type: "progress",
      message: `Drafting ${parsed.data.iterationCount} single-lever iterations…`,
    };
    const iterations = await generateIterations({
      tenantId: ctx.tenant.id,
      userId: ctx.session.userId,
      winnerSource: parsed.data.winnerSource,
      winnerTextHook,
      winnerBody,
      winnerVisualSummary,
      winnerDominantAttributes,
      iterationCount: parsed.data.iterationCount,
      lockedLevers: parsed.data.lockedLevers,
      language: parsed.data.language,
      parentConceptId,
    });
    yield { type: "result", iterations, count: iterations.length };
  });
}

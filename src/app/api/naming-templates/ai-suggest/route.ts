import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { aiChat } from "@/lib/ai/openrouter";
import { detectPatternsFromNames } from "@/lib/naming-template";
import { resolveUserLocale } from "@/lib/i18n/server";
import { localeDirective } from "@/lib/i18n/prompt";

/**
 * POST /api/naming-templates/ai-suggest?tenantSlug=<slug>
 *
 * Asks Claude to read the tenant's recent campaign names and propose
 * 1-3 naming templates. We send only names + counts (no PII, no
 * spend data), keep the prompt focused, and ask for a strict JSON
 * response so the UI can render suggestions directly.
 *
 * Cheap mode by default — uses the `lite` role (smaller model). Caller
 * can opt into `analysis` if they want higher quality.
 */

const bodySchema = z.object({
  mode: z.enum(["lite", "analysis"]).optional().default("lite"),
  // How many recent campaign names to consider
  sampleSize: z.number().int().min(20).max(500).optional().default(200),
});

function buildSuggestionPrompt(localeInstruction: string): string {
  return `You analyze a list of advertising campaign names from an SE-Asia media-buying agency and propose naming TEMPLATES the team should standardize on.

${localeInstruction}

Output rules (strict):
  - Return ONLY valid JSON matching the schema below — no prose, no markdown.
  - 1 to 3 templates. Quality > quantity.
  - Each template uses placeholders: {MM} {YY} {YYYY} {DD} {Month} {Custom}.
    Use {Custom} ONLY as a generic slot; prefer named placeholders like
    {Region} or {Product} only if you see clear evidence in the data.
  - Prefer templates that match the most common existing pattern.
  - Each template MUST include at least one date placeholder so it
    extrapolates to future campaigns automatically.

Schema:
{
  "templates": [
    {
      "name": "short label in user's language, ≤30 chars",
      "pattern": "the template string with {Placeholders}",
      "description": "one sentence in user's language explaining when to use this",
      "evidence_examples": ["existing name 1", "existing name 2"]
    }
  ],
  "notes": "optional 1-sentence summary in user's language"
}`;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const locale = await resolveUserLocale(session.userId);
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Pull recent campaign names — most recent first, capped at sampleSize.
  // MetaCampaign doesn't have a direct tenantId column; go via the
  // tenant's MetaConnection (1:1 with tenant) to look up its id first.
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  if (!conn) {
    return NextResponse.json({ error: "No Meta connection" }, { status: 400 });
  }
  const campaigns = await prisma.metaCampaign.findMany({
    where: { metaConnectionId: conn.id },
    orderBy: { lastFetchedAt: "desc" },
    take: parsed.data.sampleSize,
    select: { name: true },
  });
  const names = campaigns.map((c) => c.name).filter(Boolean);
  if (names.length === 0) {
    return NextResponse.json(
      { error: "ไม่มี campaign ใน tenant นี้สำหรับวิเคราะห์" },
      { status: 400 },
    );
  }

  // Pre-process: detect repeated skeletons so the AI starts with a hint
  // and the result is grounded.
  const skeletons = detectPatternsFromNames(names, 2, 8);

  const userMsg = [
    "Analyze these campaign names and propose naming templates.",
    "",
    `Total names: ${names.length}`,
    "",
    "Sample names (deduped, up to 50 shown):",
    Array.from(new Set(names)).slice(0, 50).map((n, i) => `  ${i + 1}. ${n}`).join("\n"),
    "",
    "Repeated skeletons detected (digits → #):",
    skeletons.length === 0
      ? "  (none stand out)"
      : skeletons
          .map(
            (s) =>
              `  ${s.skeleton}   × ${s.count}   e.g. ${s.examples.join(", ")}`,
          )
          .join("\n"),
  ].join("\n");

  try {
    const result = await aiChat({
      role: parsed.data.mode,
      system: buildSuggestionPrompt(localeDirective(locale)),
      messages: [{ role: "user", content: userMsg }],
      // Templates are tiny; cap output to keep cost predictable.
      maxTokens: 800,
    });
    // Parse JSON robustly — model sometimes wraps in fenced block
    const cleaned = result.content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid JSON", raw: result.content },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      suggestion: parsedJson,
      analyzed: names.length,
      tokens: result.usage,
    });
  } catch (err) {
    const e = err as Error;
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

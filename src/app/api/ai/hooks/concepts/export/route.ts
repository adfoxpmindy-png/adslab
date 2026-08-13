/**
 * POST /api/ai/hooks/concepts/export — export selected concepts as either
 * a flattened CSV (one row per concept × visualDirection) or a JSON
 * envelope containing one markdown file per concept.
 *
 * The JSON envelope keeps the API zip-agnostic — the client can either
 * concatenate the files into one .md download or feed them into a
 * JSZip-style bundle on the browser side without another server round trip.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { resolveTenant } from "@/lib/hooks/route-helpers";
import {
  buildConceptsCsv,
  buildConceptsMarkdownPack,
  buildConceptsMarkdownSingleFile,
} from "@/lib/hooks/export";
import { rowToConceptShape } from "@/lib/hooks/service";

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  conceptIds: z.array(z.string().min(1)).min(1).max(500),
  format: z.enum(["csv", "md-pack", "md-single"]).default("csv"),
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

  const rows = await prisma.hookConcept.findMany({
    where: { id: { in: parsed.data.conceptIds }, tenantId: ctx.tenant.id },
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "no_concepts_found" }, { status: 404 });
  }

  const concepts = rows.map(rowToConceptShape);

  if (parsed.data.format === "csv") {
    const csv = buildConceptsCsv(concepts);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hook-concepts-${Date.now()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (parsed.data.format === "md-single") {
    const md = buildConceptsMarkdownSingleFile(concepts);
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="hook-concepts-${Date.now()}.md"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // md-pack — return files as a JSON envelope; client zips or concatenates.
  const files = buildConceptsMarkdownPack(concepts);
  return NextResponse.json({ ok: true, format: "md-pack", count: files.length, files });
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { chunkText } from "@/lib/ai/chunker";
import { embedBatch } from "@/lib/ai/embeddings";

/**
 * Knowledge documents for the RAG layer. Accepts:
 *   - text paste   (sourceType: "text", body.text)
 *   - PDF upload   (multipart, sourceType: "pdf")
 *   - URL fetch    (sourceType: "url", body.url) — fetches + extracts text server-side
 *
 * On create: chunks + embeds inline (small docs). For very large PDFs
 * we'd want a background job — defer that for v1 since most uploads
 * are < 50 chunks anyway.
 */

const textSchema = z.object({
  sourceType: z.literal("text"),
  title: z.string().min(1).max(200),
  text: z.string().min(10).max(500_000),
});

const urlSchema = z.object({
  sourceType: z.literal("url"),
  title: z.string().min(1).max(200).optional(),
  url: z.string().url(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const docs = await prisma.knowledgeDocument.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceType: true,
      status: true,
      chunkCount: true,
      errorMessage: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ documents: docs });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const contentType = request.headers.get("content-type") ?? "";

  let title = "";
  let text = "";
  let sourceType: "text" | "pdf" | "url" = "text";
  let sourceMeta: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    // PDF upload path
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const formTitle = (form.get("title") as string) || file.name;
    sourceType = "pdf";
    title = formTitle.slice(0, 200);
    sourceMeta = { filename: file.name, byteSize: file.size };

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      // pdf-parse is CJS — import dynamically. Module shape varies
      // between ESM-wrapped and CJS exports; handle both.
      type PdfParseFn = (b: Buffer) => Promise<{ text: string }>;
      const pdfMod = (await import("pdf-parse")) as unknown as
        | { default: PdfParseFn }
        | PdfParseFn;
      const parser: PdfParseFn =
        typeof pdfMod === "function" ? pdfMod : pdfMod.default;
      const parsed = await parser(buffer);
      text = parsed.text ?? "";
    } catch (err) {
      return NextResponse.json(
        { error: `PDF parse failed: ${(err as Error).message}` },
        { status: 400 },
      );
    }
  } else {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const asText = textSchema.safeParse(body);
    const asUrl = urlSchema.safeParse(body);
    if (asText.success) {
      sourceType = "text";
      title = asText.data.title;
      text = asText.data.text;
    } else if (asUrl.success) {
      sourceType = "url";
      title = asUrl.data.title ?? asUrl.data.url;
      sourceMeta = { url: asUrl.data.url };
      try {
        const fetched = await fetch(asUrl.data.url, {
          headers: { "User-Agent": "AdsLab-Knowledge-Fetcher/1.0" },
        });
        if (!fetched.ok) throw new Error(`HTTP ${fetched.status}`);
        const raw = await fetched.text();
        // Strip tags — enough for most docs. Reader-quality extraction
        // (Mozilla readability) deferred to a Phase 7.3.1.
        text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      } catch (err) {
        return NextResponse.json(
          { error: `URL fetch failed: ${(err as Error).message}` },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        {
          error: "Invalid body — provide { sourceType: 'text', title, text } or { sourceType: 'url', url }",
        },
        { status: 400 },
      );
    }
  }

  if (text.length < 50) {
    return NextResponse.json(
      { error: "Extracted text too short (< 50 chars) — nothing to embed" },
      { status: 400 },
    );
  }

  // Create document in `processing` state
  const doc = await prisma.knowledgeDocument.create({
    data: {
      tenantId: tenant.id,
      title,
      sourceType,
      sourceMeta: sourceMeta as never,
      status: "processing",
      createdByUserId: session.userId,
    },
  });

  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: { status: "failed", errorMessage: "No chunks produced" },
      });
      return NextResponse.json({ error: "Empty after chunking" }, { status: 400 });
    }

    const embeds = await embedBatch(chunks.map((c) => c.content));

    // Insert chunks via raw SQL so the vector column is set correctly.
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const e = embeds[i];
      const vectorLiteral = `[${e.embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeChunk" (id, "documentId", content, embedding, tokens, ordinal, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3::vector, $4, $5, NOW())`,
        doc.id,
        c.content,
        vectorLiteral,
        e.tokens,
        c.ordinal,
      );
    }

    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: "ready", chunkCount: chunks.length },
    });

    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        sourceType: doc.sourceType,
        status: "ready",
        chunkCount: chunks.length,
      },
    });
  } catch (err) {
    const e = err as Error;
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: "failed", errorMessage: e.message.slice(0, 500) },
    });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

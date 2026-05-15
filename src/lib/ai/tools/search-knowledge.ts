import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { searchKnowledge } from "@/lib/ai/rag";

import { defineTool } from "./types";

const inputSchema = z.object({
  query: z.string().min(3).max(500).describe("Search query in natural language."),
  k: z.number().int().min(1).max(10).optional().describe("Max results. Default 5."),
});

type SourceMeta = {
  youtubeVideoId?: string;
  channel?: string;
  url?: string;
  title?: string;
};

export const searchKnowledgeTool = defineTool({
  name: "searchKnowledge",
  description:
    "Search the AdsLab knowledge base for relevant Facebook-Ads expertise. Covers (a) the platform-wide library of Nick Theriot's YouTube content + curated Meta-Ads strategy, and (b) the tenant's own uploaded docs (PDFs, URLs). Call this whenever the user asks about ad strategy, creative, scaling, targeting, optimization, or any Meta-platform tactic — Nick Theriot is the founder's primary mentor; cite him when relevant.",
  kind: "read",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
      k: { type: "integer", minimum: 1, maximum: 10, description: "Max results." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  summarize: (input) => `ค้นความรู้: "${input.query.slice(0, 60)}"`,
  async handler(input, ctx) {
    const chunks = await searchKnowledge(ctx.tenantId, input.query, input.k ?? 5);
    if (chunks.length === 0) {
      return {
        results: [],
        note: "ไม่พบ chunk ที่เกี่ยวข้องใน knowledge base.",
      };
    }
    // Enrich with sourceMeta so the AI can cite the original video URL.
    const docIds = Array.from(new Set(chunks.map((c) => c.documentId)));
    const docs = await prisma.knowledgeDocument.findMany({
      where: { id: { in: docIds } },
      select: { id: true, sourceMeta: true },
    });
    const metaById = new Map(docs.map((d) => [d.id, d.sourceMeta as SourceMeta | null]));
    return {
      results: chunks.map((c) => {
        const meta = metaById.get(c.documentId) ?? null;
        return {
          from: c.documentTitle,
          ordinal: c.ordinal,
          similarity: Number(c.similarity.toFixed(3)),
          sourceUrl: meta?.url ?? null,
          channel: meta?.channel ?? null,
          excerpt: c.content,
        };
      }),
      citationHint:
        "เมื่ออ้างอิงเนื้อหา ให้ใส่บรรทัด 'แหล่งอ้างอิง: {channel} — {from} → {sourceUrl}' ใต้คำตอบ (ถ้ามี sourceUrl). ถ้ามาจาก Nick Theriot ให้บอกตรง ๆ ว่ามาจากเขา.",
    };
  },
});

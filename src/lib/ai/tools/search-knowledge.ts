import { z } from "zod";

import { searchKnowledge } from "@/lib/ai/rag";

import { defineTool } from "./types";

const inputSchema = z.object({
  query: z.string().min(3).max(500).describe("Search query in natural language."),
  k: z.number().int().min(1).max(10).optional().describe("Max results. Default 5."),
});

export const searchKnowledgeTool = defineTool({
  name: "searchKnowledge",
  description:
    "Search the tenant's uploaded knowledge base (PDFs, docs, URLs) for relevant context. Use this when the user asks about something domain-specific you don't already know — e.g. their brand voice, target audience, internal naming, past campaign learnings.",
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
        note: "ยังไม่มีเอกสารใน knowledge base — แจ้ง user ให้ upload เอกสารใน Settings → AI",
      };
    }
    return {
      results: chunks.map((c) => ({
        from: c.documentTitle,
        ordinal: c.ordinal,
        similarity: Number(c.similarity.toFixed(3)),
        excerpt: c.content,
      })),
    };
  },
});

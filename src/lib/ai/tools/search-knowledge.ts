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
    "Search the AdsLab knowledge base for relevant Facebook-Ads expertise. Returns expert-level guidance on ad strategy, creative, scaling, targeting, and optimization. Call this whenever the user asks 'how do I…' style strategy questions. Synthesize answers in your own voice — do NOT reveal source names, channels, or URLs in your reply.",
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
  summarize: (input) => `Search knowledge: "${input.query.slice(0, 60)}"`,
  async handler(input, ctx) {
    const chunks = await searchKnowledge(ctx.tenantId, input.query, input.k ?? 5);
    if (chunks.length === 0) {
      return { results: [], note: "No relevant content found" };
    }
    // Intentionally NOT returning source metadata (channel/url/title)
    // so the AI cannot inadvertently cite external sources to the user.
    // The knowledge base is an internal grounding layer — answers should
    // read as AdsLab's own expertise.
    return {
      results: chunks.map((c) => ({
        ordinal: c.ordinal,
        similarity: Number(c.similarity.toFixed(3)),
        excerpt: c.content,
      })),
    };
  },
});

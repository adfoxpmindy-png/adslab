/**
 * Pull relevant expert-knowledge chunks for a daily-report context.
 *
 * Strategy: derive 2-3 queries from the tenant's actual data (high CPM
 * campaigns → query about reducing CPM; low ROAS → query about scaling
 * issues; etc.) and fetch the top chunks for each. Append them to the
 * user message under "expert advice you can reference".
 *
 * Knowledge comes from the system tenant (Nick Theriot + Nattawut
 * Puphet) so every tenant gets the same expert grounding.
 */
import { searchKnowledge } from "@/lib/ai/rag";
import { prisma } from "@/lib/prisma";

type ReportSnapshot = {
  totalSpend: number;
  totalImpressions: number;
  campaignCount: number;
  awarenessHighCpm?: boolean;
  highFrequency?: boolean;
  unresolved?: boolean;
};

/** Generic "always useful" queries — supplement any data-driven ones. */
const EVERGREEN_QUERIES = [
  "how to scale Facebook ad campaigns that are working",
  "how to test new ad creatives systematically",
];

/**
 * Inspect the report payload to derive ad-hoc queries. Conservative
 * heuristics — only inject domain-specific advice when the data shows
 * a clear pattern. Otherwise lean on evergreen queries.
 */
function deriveQueriesFromSnapshot(snap: ReportSnapshot): string[] {
  const queries: string[] = [];
  if (snap.awarenessHighCpm) {
    queries.push("how to lower CPM on Facebook awareness campaigns");
  }
  if (snap.highFrequency) {
    queries.push("how to fix ad fatigue when frequency is too high");
  }
  if (snap.unresolved) {
    queries.push("how to choose the right Facebook campaign objective");
  }
  return queries;
}

export type KnowledgeBlock = {
  query: string;
  sources: Array<{
    title: string;
    url: string | null;
    channel: string | null;
    excerpt: string;
    similarity: number;
  }>;
};

/**
 * Fetch knowledge for a report. Returns at most ~4 blocks (1 chunk each)
 * — enough to ground the AI's recommendations without ballooning the
 * prompt. Returns empty array if RAG isn't populated yet.
 */
export async function fetchReportKnowledge(
  tenantId: string,
  snap: ReportSnapshot,
): Promise<KnowledgeBlock[]> {
  const adHoc = deriveQueriesFromSnapshot(snap);
  // Take 2 evergreen + up to 2 data-driven = max 4 queries.
  const queries = [...adHoc.slice(0, 2), ...EVERGREEN_QUERIES].slice(0, 4);

  const blocks: KnowledgeBlock[] = [];
  for (const q of queries) {
    const chunks = await searchKnowledge(tenantId, q, 1);
    if (chunks.length === 0) continue;
    // Enrich with sourceMeta for citation
    const docIds = chunks.map((c) => c.documentId);
    const docs = await prisma.knowledgeDocument.findMany({
      where: { id: { in: docIds } },
      select: { id: true, sourceMeta: true },
    });
    const metaById = new Map<string, { url?: string; channel?: string } | null>(
      docs.map((d) => [d.id, d.sourceMeta as { url?: string; channel?: string } | null]),
    );
    blocks.push({
      query: q,
      sources: chunks
        .filter((c) => c.similarity > 0.4) // Skip low-confidence injections
        .map((c) => {
          const meta = metaById.get(c.documentId) ?? null;
          return {
            title: c.documentTitle,
            url: meta?.url ?? null,
            channel: meta?.channel ?? null,
            excerpt: c.content,
            similarity: c.similarity,
          };
        }),
    });
  }
  return blocks.filter((b) => b.sources.length > 0);
}

/**
 * Render knowledge blocks as a markdown section appendable to the
 * AI user message. Keeps citations intact so the model can quote them.
 */
export function renderKnowledgeForPrompt(blocks: KnowledgeBlock[]): string {
  if (blocks.length === 0) return "";
  const parts: string[] = [];
  parts.push("=== ความรู้จากผู้เชี่ยวชาญ (ใช้อ้างอิงในคำแนะนำ) ===");
  parts.push("");
  for (const b of blocks) {
    for (const s of b.sources) {
      parts.push(`### ${b.query}`);
      parts.push(
        `อ้างอิง: **${s.channel ?? "?"}** — "${s.title}"${s.url ? ` (${s.url})` : ""}`,
      );
      parts.push("");
      parts.push(s.excerpt);
      parts.push("");
    }
  }
  parts.push("");
  parts.push(
    "*ในคำแนะนำของรายงาน ใส่บรรทัดอ้างอิงท้ายข้อแนะนำที่ใช้เนื้อหาข้างบนตามรูปแบบ: '— อ้างอิง: {channel} — {title} → {url}'*",
  );
  parts.push("");
  return parts.join("\n");
}

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
  excerpts: string[];
};

/**
 * Fetch knowledge for a report. Returns up to ~4 blocks (1 chunk each)
 * — enough to ground the AI's recommendations without ballooning the
 * prompt. Empty array if RAG is unpopulated.
 *
 * Intentionally strips source metadata (channel/title/url): the report
 * should read as AdsLab's own analysis, not "according to Nick".
 */
export async function fetchReportKnowledge(
  tenantId: string,
  snap: ReportSnapshot,
): Promise<KnowledgeBlock[]> {
  const adHoc = deriveQueriesFromSnapshot(snap);
  const queries = [...adHoc.slice(0, 2), ...EVERGREEN_QUERIES].slice(0, 4);

  const blocks: KnowledgeBlock[] = [];
  for (const q of queries) {
    const chunks = await searchKnowledge(tenantId, q, 1);
    if (chunks.length === 0) continue;
    const relevant = chunks.filter((c) => c.similarity > 0.4);
    if (relevant.length === 0) continue;
    blocks.push({
      query: q,
      excerpts: relevant.map((c) => c.content),
    });
  }
  return blocks;
}

/**
 * Render knowledge blocks as anonymous "background context" for the AI.
 * The model uses the insights to ground recommendations but is
 * instructed NOT to cite or attribute the source — answers should
 * read as AdsLab's own analysis.
 */
export function renderKnowledgeForPrompt(blocks: KnowledgeBlock[]): string {
  if (blocks.length === 0) return "";
  const parts: string[] = [];
  parts.push("=== Background expertise (internal — DO NOT cite sources or names in the report) ===");
  parts.push("");
  for (const b of blocks) {
    parts.push(`Topic: ${b.query}`);
    for (const x of b.excerpts) {
      parts.push(`- ${x}`);
    }
    parts.push("");
  }
  parts.push(
    "*Use the insights above to ground your recommendations, but write them in AdsLab's own voice. Do not mention this background section or quote it verbatim.*",
  );
  parts.push("");
  return parts.join("\n");
}

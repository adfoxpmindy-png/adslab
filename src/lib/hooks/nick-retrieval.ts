/**
 * Nick RAG retrieval with citations preserved.
 *
 * Hook Lab needs YouTube URLs + video titles surfaced in the UI on every
 * concept card (IP hygiene — "we cite Nick, we don't repackage"). The
 * existing src/lib/ai/rag.ts::searchKnowledge helper strips
 * KnowledgeDocument.sourceMeta.sourceUrl before returning, so we roll a
 * dedicated retriever that keeps those fields intact.
 *
 * Reads from the __adslab_system tenant only (Nick corpus lives there —
 * see memory/reference_system_knowledge_base.md). Mirror pattern of
 * scripts/nick-proof.ts.
 */

import { prisma } from "@/lib/prisma";
import { embed } from "@/lib/ai/embeddings";
import { SYSTEM_TENANT_SLUG } from "@/lib/ai/rag";

export interface NickChunk {
  /** Chunk text (may be up to ~800 chars per chunker settings). */
  content: string;
  /** YouTube URL from KnowledgeDocument.sourceMeta.sourceUrl (or empty). */
  sourceUrl: string;
  /** Human-readable video title (KnowledgeDocument.title). */
  title: string;
  /** Position in the source document (1-indexed for UI). */
  ordinal: number;
  /** 0..1 cosine similarity (1 = identical). */
  similarity: number;
}

let cachedSystemTenantId: string | null = null;
async function getSystemTenantId(): Promise<string | null> {
  if (cachedSystemTenantId) return cachedSystemTenantId;
  const t = await prisma.tenant.findUnique({
    where: { slug: SYSTEM_TENANT_SLUG },
    select: { id: true },
  });
  cachedSystemTenantId = t?.id ?? null;
  return cachedSystemTenantId;
}

/**
 * Retrieve top-k Nick chunks for a hook-shaped query, preserving the
 * sourceUrl and title fields for citation display.
 *
 * Returns [] when the system tenant is not seeded or the query is empty
 * (silent so the caller can decide UX — usually "no citations to show").
 */
export async function retrieveNickChunksForHook(
  query: string,
  k = 4,
): Promise<NickChunk[]> {
  const trimmed = (query ?? "").trim();
  if (trimmed.length === 0) return [];

  const systemTenantId = await getSystemTenantId();
  if (!systemTenantId) return [];

  const { embedding } = await embed(trimmed);
  const vectorLiteral = `[${embedding.join(",")}]`;

  // Query KnowledgeChunk + KnowledgeDocument, pulling sourceMeta so we can
  // extract sourceUrl for citations. Prisma can't express pgvector ops
  // directly — same raw pattern as searchKnowledge/nick-proof.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      content: string;
      ordinal: number;
      documentTitle: string;
      sourceMeta: unknown;
      distance: number;
    }>
  >(
    `
    SELECT
      kc.content,
      kc.ordinal,
      kd.title       AS "documentTitle",
      kd."sourceMeta" AS "sourceMeta",
      (kc.embedding <=> $1::vector) AS distance
    FROM "KnowledgeChunk" kc
    JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
    WHERE kd."tenantId" = $2 AND kd.status = 'ready'
    ORDER BY kc.embedding <=> $1::vector ASC
    LIMIT $3
    `,
    vectorLiteral,
    systemTenantId,
    k,
  );

  return rows.map((r) => ({
    content: r.content,
    sourceUrl: extractSourceUrl(r.sourceMeta),
    title: r.documentTitle,
    ordinal: r.ordinal,
    similarity: 1 - r.distance,
  }));
}

/**
 * Best-effort extractor for a YouTube URL out of KnowledgeDocument.sourceMeta.
 * Accepts several historical shapes ({sourceUrl}, {url}, {youtube_url}, string).
 */
function extractSourceUrl(sourceMeta: unknown): string {
  if (!sourceMeta) return "";
  if (typeof sourceMeta === "string") return sourceMeta;
  if (typeof sourceMeta !== "object") return "";
  const meta = sourceMeta as Record<string, unknown>;
  const candidates = [
    meta.sourceUrl,
    meta.source_url,
    meta.url,
    meta.youtube_url,
    meta.youtubeUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return "";
}

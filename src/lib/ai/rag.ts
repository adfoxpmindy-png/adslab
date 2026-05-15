import { prisma } from "@/lib/prisma";
import { embed } from "./embeddings";

/**
 * Slug of the platform-wide "system" tenant. Documents owned by this
 * tenant are visible to every tenant's AI chat (curated Meta Ads
 * knowledge base, AdsLab how-to guides, etc.).
 *
 * Resolved to its id once per process and cached.
 */
export const SYSTEM_TENANT_SLUG = "__adslab_system";

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
 * Retrieve top-K relevant knowledge chunks for a query. Uses pgvector
 * cosine similarity (<=>) since the column is `vector(1536)` and we
 * default to OpenAI text-embedding-3-small (normalized vectors).
 *
 * Searches both the caller tenant's own documents AND the system-wide
 * knowledge base (`__adslab_system` tenant). Returns chunks with
 * similarity scores so the caller can decide whether the match is
 * strong enough to inject.
 */

export type RetrievedChunk = {
  documentId: string;
  documentTitle: string;
  content: string;
  ordinal: number;
  similarity: number; // 1.0 = identical, 0.0 = orthogonal
};

export async function searchKnowledge(
  tenantId: string,
  query: string,
  k = 5,
): Promise<RetrievedChunk[]> {
  const { embedding } = await embed(query);

  // pgvector cosine distance: smaller = closer. We convert to similarity
  // = 1 - distance for caller convenience.
  // Use raw SQL because Prisma can't express vector ops directly.
  const systemTenantId = await getSystemTenantId();
  const vectorLiteral = `[${embedding.join(",")}]`;
  const tenantIds = systemTenantId ? [tenantId, systemTenantId] : [tenantId];

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      content: string;
      ordinal: number;
      documentId: string;
      documentTitle: string;
      distance: number;
    }>
  >(
    `
    SELECT
      kc.content,
      kc.ordinal,
      kc."documentId",
      kd.title AS "documentTitle",
      (kc.embedding <=> $1::vector) AS distance
    FROM "KnowledgeChunk" kc
    JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
    WHERE kd."tenantId" = ANY($2::text[]) AND kd.status = 'ready'
    ORDER BY kc.embedding <=> $1::vector ASC
    LIMIT $3
    `,
    vectorLiteral,
    tenantIds,
    k,
  );

  return rows.map((r) => ({
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    content: r.content,
    ordinal: r.ordinal,
    similarity: 1 - r.distance,
  }));
}

import { prisma } from "@/lib/prisma";
import { embed } from "./embeddings";

/**
 * Retrieve top-K relevant knowledge chunks for a query. Uses pgvector
 * cosine similarity (<=>) since the column is `vector(1536)` and we
 * default to OpenAI text-embedding-3-small (normalized vectors).
 *
 * Returns chunks with similarity scores so the caller can decide
 * whether the match is strong enough to inject. Empty array if the
 * tenant has no documents.
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
  const vectorLiteral = `[${embedding.join(",")}]`;
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
    WHERE kd."tenantId" = $2 AND kd.status = 'ready'
    ORDER BY kc.embedding <=> $1::vector ASC
    LIMIT $3
    `,
    vectorLiteral,
    tenantId,
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

import OpenAI from "openai";

/**
 * Embedding pipeline for RAG knowledge base.
 *
 * We use OpenAI text-embedding-3-small (1536-dim) via OpenRouter. It's
 * cheap (~$0.02 / 1M tokens) and a strong baseline for retrieval. The
 * vector dimension matches the `vector(1536)` column we declared on
 * KnowledgeChunk.
 *
 * OpenRouter currently routes the OpenAI embedding model directly to
 * OpenAI's API. If we ever need to swap (e.g. Voyage AI for code-heavy
 * domains), we'd change MODEL_ID here.
 */

const MODEL_ID = "openai/text-embedding-3-small";
const DIMS = 1536;

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  _client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-Title": "AdsLab",
    },
  });
  return _client;
}

export type EmbedResult = {
  embedding: number[];
  tokens: number;
};

/** Embed a single text chunk. Returns a 1536-dim vector + token count. */
export async function embed(text: string): Promise<EmbedResult> {
  const client = getClient();
  const res = await client.embeddings.create({
    model: MODEL_ID,
    input: text,
  });
  const first = res.data[0];
  if (!first?.embedding) throw new Error("Embeddings API returned no data");
  if (first.embedding.length !== DIMS) {
    throw new Error(
      `Unexpected embedding dim ${first.embedding.length} (want ${DIMS})`,
    );
  }
  return {
    embedding: first.embedding,
    tokens: res.usage?.prompt_tokens ?? 0,
  };
}

/** Batch embed multiple chunks. Calls one API request per ~100 inputs. */
export async function embedBatch(
  texts: string[],
): Promise<{ embedding: number[]; tokens: number }[]> {
  if (texts.length === 0) return [];
  const client = getClient();
  // OpenAI embeddings supports batch up to 2048 inputs; we cap at 100
  // to keep individual requests under ~250K tokens for safety.
  const results: { embedding: number[]; tokens: number }[] = [];
  const BATCH = 100;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await client.embeddings.create({
      model: MODEL_ID,
      input: slice,
    });
    // OpenAI returns tokens for the WHOLE batch — distribute proportionally.
    const totalTokens = res.usage?.prompt_tokens ?? 0;
    const totalChars = slice.reduce((s, t) => s + t.length, 0);
    for (let j = 0; j < res.data.length; j++) {
      const item = res.data[j];
      if (!item?.embedding) throw new Error("Embeddings batch missing item");
      const share = totalChars > 0 ? (slice[j].length / totalChars) * totalTokens : 0;
      results.push({ embedding: item.embedding, tokens: Math.round(share) });
    }
  }
  return results;
}

export const EMBEDDING_DIMS = DIMS;

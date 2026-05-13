/**
 * Sentence-aware text chunker for RAG.
 *
 * Target: ~512 tokens per chunk with ~50-token overlap (helps retrieve
 * context that spans a chunk boundary). We approximate tokens by chars
 * since the embedding tokenizer is unavailable client-side and tiktoken
 * isn't free for Thai (1.5-2x more tokens than English). Rough heuristic:
 *   - Thai/CJK ≈ 1 token per character
 *   - English ≈ 1 token per 4 characters
 *
 * We bias on the safe side (assume 1 token per 2 chars) so chunks stay
 * under the 8k input limit of text-embedding-3-small.
 */

const TARGET_CHARS = 1024; // ~512 tokens at our heuristic
const OVERLAP_CHARS = 100; // ~50 tokens

export type Chunk = {
  content: string;
  ordinal: number;
};

export function chunkText(text: string): Chunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  // Split into sentences first (Thai uses no period — fallback to
  // newlines + common Thai sentence enders).
  const sentences = splitIntoSentences(cleaned);

  const chunks: Chunk[] = [];
  let current = "";
  let ordinal = 0;

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > TARGET_CHARS) {
      if (current.trim()) {
        chunks.push({ content: current.trim(), ordinal: ordinal++ });
        // Carry over the tail as overlap
        const tail = current.slice(-OVERLAP_CHARS);
        current = tail + " " + sentence;
      } else {
        // Single sentence longer than TARGET_CHARS — hard-split it
        for (let i = 0; i < sentence.length; i += TARGET_CHARS) {
          chunks.push({
            content: sentence.slice(i, i + TARGET_CHARS).trim(),
            ordinal: ordinal++,
          });
        }
        current = "";
      }
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) {
    chunks.push({ content: current.trim(), ordinal: ordinal++ });
  }
  return chunks;
}

function splitIntoSentences(text: string): string[] {
  // Split on newlines first (preserves logical structure).
  const lines = text.split(/\n\n+/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    // Within a paragraph, split on Thai/English sentence enders.
    const parts = line.split(/(?<=[.!?。!?ฯ])\s+/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

## Context

AdsLab already has the full RAG stack: pgvector column on `KnowledgeChunk`, OpenAI text-embedding-3-small (1536 dims), `searchKnowledge` tool exposed to the AI chat. What's missing is content. The founder's mental model of Facebook advertising is heavily shaped by Nick Theriot's YouTube content, so importing that channel's transcripts gives the AI a voice that matches what the founder would say himself.

Two operational constraints already established earlier in this session:
- `rag.ts` was modified to UNION the caller's tenant with a system tenant id (cached at first call from slug `__adslab_system`)
- AdsLab is on Vercel Hobby — long-running ingest jobs cannot run on Vercel; they must execute locally or in CI

## Goals / Non-Goals

### Goals
- One-command ingest of an arbitrary YouTube channel into the system knowledge base
- Idempotent re-runs (skip videos already ingested by youtubeVideoId)
- Phase 1: validate end-to-end with 50-100 videos, confirm AI chat retrieves and cites them
- Phase 2: scale to all 928 of Nick's videos, parallelised
- Citations in AI answers point back to specific videos (title + URL + timestamp where possible)

### Non-Goals
- Real-time sync with YouTube (one-shot ingest is enough; re-run weekly via cron if needed)
- Translation to Thai (text-embedding-3-small handles cross-lingual queries well; AI can answer Thai from English transcripts)
- Video download — we only need captions, not the audio/video files
- UI for managing system knowledge — admin-only via script for now
- Other channels — pipeline is generic but Phase 1 ships with one channel hardcoded

## Decisions

### D1: yt-dlp for both listing + captions, not the official YouTube Data API

**Decision:** Use `yt-dlp` (already installed) for listing channel videos and fetching auto-caption text.

**Alternatives considered:**
- YouTube Data API v3 — requires API key + project setup + quota management. 928 videos easily hits the 10K/day quota.
- youtubei.js (npm) — newer unofficial library but less battle-tested than yt-dlp.

**Why this wins:** Zero auth setup, no quota worries, identical interface for video list and caption fetch. Already installed and proven on similar tasks.

### D2: Per-video KnowledgeDocument, not per-channel

**Decision:** Each video becomes one `KnowledgeDocument` row. A 928-video channel produces 928 documents.

**Alternatives considered:**
- One document per channel — cleaner schema but loses per-video metadata; citations get vague ("Nick Theriot's channel said X").
- One document per topic across videos — would require LLM-based topic clustering before ingestion (slow + lossy).

**Why this wins:** Citations need to point to a specific video URL. KnowledgeDocument's existing `sourceMeta` JSON column carries `{ youtubeVideoId, title, publishedAt, durationSeconds, channel }` cleanly.

### D3: Auto-captions only, no transcription fallback

**Decision:** Skip videos that don't have English auto-captions (yt-dlp `--write-auto-sub --sub-lang en`). No Whisper/transcription fallback.

**Alternatives considered:**
- Download audio + transcribe via Whisper API — ~$0.006/min × ~10min/video × 928 = ~$55. Adds 30-60 min of compute time.
- Use yt-dlp's manual subtitles when available (some videos have human-edited ones).

**Why this wins:** YouTube generates auto-captions for English on virtually every uploaded video — the skip-rate will be very low. The cost of transcription isn't worth the marginal coverage. We log skipped videos so we can decide later if Whisper is worth adding.

### D4: Idempotency via sourceMeta JSON key match, not a dedicated unique index

**Decision:** Before ingesting a video, query `prisma.knowledgeDocument.findFirst({ where: { sourceMeta: { path: ["youtubeVideoId"], equals: "<id>" } } })`. Skip if found.

**Alternatives considered:**
- Add a unique index on a generated column `(sourceMeta->>'youtubeVideoId')`.
- Add a dedicated `externalId` column to KnowledgeDocument.

**Why this wins:** Zero schema migration. JSON path queries are fast enough on Postgres for 1000s of docs. If ingest grows beyond 10K docs we'll add the column then.

### D5: Chunk after concatenating caption lines into paragraphs

**Decision:** YouTube captions arrive as ~5-second snippets. Pre-process: strip timestamps, concatenate consecutive lines into paragraph-style text, then run through the existing `chunkText()` which targets ~512 tokens.

**Alternatives considered:**
- Chunk caption snippets directly — but a single sentence often spans 3-4 snippets, breaking mid-thought hurts retrieval quality.
- Preserve timestamps for citation precision — adds noise to the text the LLM sees; defer to Phase 2.

**Why this wins:** Chunks read like paragraphs. Embeddings reflect semantic concepts, not artificial 5-second breaks. Chunk sentences cleanly because `chunkText` already splits on sentence boundaries.

### D6: Parallel ingest with bounded concurrency (5-10 workers)

**Decision:** Use `Promise.all` over batches of 5 videos at a time for fetch + chunk; serialise the DB inserts.

**Alternatives considered:**
- Fully sequential — Phase 2 takes 1-3 hours (acceptable but slow).
- Aggressive parallelism (50+ workers) — risks YouTube rate-limiting + IP throttling.

**Why this wins:** 5-10 workers cuts Phase 2 to ~30-45 min while staying well under any plausible rate limit on a residential connection. Sequential DB writes avoid transaction contention on pgvector inserts.

## Risks / Trade-offs

- **[Cross-lingual quality]** Founder + customers ask in Thai; corpus is English. → Mitigation: text-embedding-3-small is trained on multilingual data; cosine similarity scores between Thai queries and English chunks are usable. We'll measure on real prompts before Phase 2 commits to 928 videos.

- **[Caption quality varies]** YouTube auto-captions miss jargon, brand names, prices. → Mitigation: log skipped chunks with low confidence; consider manual review pass for the 20-30 most-viewed videos.

- **[Channel content evolves]** New videos won't appear after ingest until we re-run. → Mitigation: document a weekly cron job pattern in the script header. Add in Phase 2 if useful.

- **[Citation copyright concerns]** Pulling Nick's full transcripts and embedding them is fair-use-ish (commentary/transformation) but he could object. → Mitigation: store URL + title + duration in sourceMeta so the AI surface cites the original video prominently. Don't redistribute the full transcript anywhere user-visible. If Nick asks, take it down.

- **[Embedding cost overrun on retries]** Re-running the ingest mid-failure could double-charge for embeddings. → Mitigation: persist a per-video log file so retries skip completed work. The idempotency check (D4) catches the common path.

- **[Large transcript exhausting OpenAI rate limit]** Embedding 3000+ chunks in a tight loop may hit rate limits. → Mitigation: existing `embedBatch` helper supports batching to 100 inputs per request; pace at ~100 batches/min.

## Migration Plan

1. **Seed system tenant** — run `scripts/seed-system-tenant.ts` once locally to create the `__adslab_system` Tenant row. Idempotent.
2. **Phase 1 ingest (today)** — run `scripts/ingest-youtube-channel.ts --channel @NickTheriot --limit 50`. ~10-15 minutes. Verify in DB + manually probe the AI chat with 3-5 Thai prompts.
3. **Verify retrieval quality** — sample 10 chunks the AI retrieves for typical questions, score relevance subjectively. If < 70% useful, tune chunk size / system prompt before scaling.
4. **Phase 2 ingest (later, when ready)** — run with `--limit 0` (all videos). ~30-60 minutes. Watch for embedding rate limits.
5. **No rollback needed** — to revert, run `prisma.knowledgeDocument.deleteMany({ where: { tenantId: SYSTEM_ID } })`. Tenants' own knowledge is untouched.

## Open Questions

1. **Should we strip Nick's intro/outro boilerplate before chunking?** ("Hey guys, welcome back to the channel...") → Probably yes but it's a small content win and a noisy regex. Defer.

2. **Surface a "powered by Nick Theriot" disclosure in chat?** → Probably yes once we're past Phase 1 — protects against fair-use challenge + builds founder credibility.

3. **Index by topic tag?** → Would help precision but requires LLM classification per chunk = expensive. Defer until we observe what queries fail.

4. **Pre-translate to Thai?** → Would add cost (translation API) but might bump cross-lingual retrieval quality. Skip for Phase 1; measure first.

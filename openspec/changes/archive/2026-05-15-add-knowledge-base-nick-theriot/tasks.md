# Tasks — add-knowledge-base-nick-theriot

## 1. System tenant

- [x] 1.1 `scripts/seed-system-tenant.ts` — upsert `Tenant` with slug `__adslab_system`. Idempotent.
- [x] 1.2 Run + verified — system tenant id `cmp72jomt0000ck7k7rnvvaua`.

## 2. RAG cross-tenant search

- [x] 2.1 `src/lib/ai/rag.ts` UNIONs caller-tenant + system-tenant via `tenantId = ANY($2::text[])`.
- [x] 2.2 `getSystemTenantId()` resolves once + caches.
- [x] 2.3 Smoke test: probe-knowledge-search.ts confirms cross-tenant retrieval works.

## 3. Ingestion pipeline

- [x] 3.1 `scripts/ingest-youtube-channel.ts` — CLI flags `--channel`, `--limit`, `--concurrency`, `--lang`, `--dry-run`.
- [x] 3.2 Step A: yt-dlp `--flat-playlist` + filter Shorts.
- [x] 3.3 Step B: idempotency via `sourceMeta.youtubeVideoId`.
- [x] 3.4 Step C: fetch captions, try priority langs (`--lang en,th`).
- [x] 3.5 Step D: clean VTT — strip timestamps, dedupe overlapping lines.
- [x] 3.6 Step E: chunk via `chunkText()`.
- [x] 3.7 Step F: embed via `embedBatch()`.
- [x] 3.8 Step G: insert `KnowledgeDocument` with `sourceMeta { youtubeVideoId, channel, title, publishedAt, durationSeconds, url, captionLang }`.
- [x] 3.9 Per-video try/catch — failure cleans up partial document.
- [x] 3.10 Concurrency 5 via Promise.all batch.

## 4. Phase 1 ingest (validation)

- [x] 4.1 Ran `--limit 50` against @NickTheriot.
- [x] 4.2 DB verified: KnowledgeDocument rows with chunkCount > 0, status=ready, no orphans.
- [x] 4.3 Retrieval probe: 5 typical Thai+English questions all returned relevant Nick chunks at 35-73% similarity.
- [x] 4.4 search-knowledge tool description updated to mention Nick + Nattawut + citation format.
- [x] 4.5 Citation hint included in tool result for AI to format.

## 5. Phase 2 ingest (full channel)

- [x] 5.1 Ran `--limit 0` against @NickTheriot. **52 new videos** ingested (1,231 new chunks). Most older videos (~824) skipped: no English captions enabled by uploader.
- [x] 5.2 No OpenAI rate-limit errors hit (parallel 5 was safe).
- [x] 5.3 Total Nick docs in DB: 102 documents / 2,889 chunks.
- [x] 5.4 Retrieval re-probed post-expansion: quality improved (some queries jumped from 63% → 73%).

## 6. Nattawut Puphet ingest (BLOCKED)

- [x] 6.1 Attempted `--lang th` against @NattawutPuphet. Discovered ~99% of his content is **YouTube channel members-only (LV.3+)** — yt-dlp blocked at "available to channel's members" error.
- [x] 6.2 Yielded only 2 documents / 57 chunks from the few public videos.
- [x] 6.3 Documented blocker: requires browser cookies from a logged-in member account to scrape. Out of scope for Phase 1.

## 7. AI chat citation surface

- [x] 7.1 `searchKnowledgeTool` result now includes `sourceUrl`, `channel`, `citationHint`.
- [x] 7.2 `chat-service.ts` system prompt updated to instruct calling searchKnowledge for strategy questions + cite as "แหล่งอ้างอิง: {channel} — {title} → {url}".

## 8. Knowledge integration into other AI features (BONUS)

- [x] 8.1 `src/lib/reports/knowledge-injection.ts` — fetches 2-4 relevant chunks per Daily Report based on tenant's data (high-CPM awareness, unresolved goals, plus evergreen scaling/testing queries).
- [x] 8.2 `daily-report.ts` appends rendered knowledge block to user message before AI call; best-effort failure mode.
- [x] 8.3 `/api/rules/suggest` pre-fetches CPV/ROAS-pause expertise from RAG, injects into Claude's user message so suggested rules are grounded in practitioner thresholds.

## 9. Documentation + memory

- [x] 9.1 Auto-memory entry written: `reference_system_knowledge_base.md`.
- [x] 9.2 MEMORY.md index entry added.

## 10. OpenSpec archive

- [ ] 10.1 Mark all tasks complete (this file).
- [ ] 10.2 Verify `openspec status` shows 4/4 artifacts complete.
- [ ] 10.3 Sync delta spec to `openspec/specs/system-knowledge-base/spec.md`.
- [ ] 10.4 Archive change to `openspec/changes/archive/2026-05-15-add-knowledge-base-nick-theriot/`.

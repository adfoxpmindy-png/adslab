# Tasks — add-knowledge-base-nick-theriot

## 1. System tenant

- [ ] 1.1 Write `scripts/seed-system-tenant.ts` — upsert `Tenant` with slug `__adslab_system`, name `AdsLab System`. Idempotent. Log resulting tenant id.
- [ ] 1.2 Run locally once + verify in DB. Document the resulting id in the script header for future debugging.

## 2. RAG cross-tenant search

- [x] 2.1 Modify `src/lib/ai/rag.ts` to UNION caller-tenant + system-tenant in the SELECT. **Done earlier this session.**
- [x] 2.2 Cache system-tenant id at module level (resolved once from slug). **Done.**
- [ ] 2.3 Smoke test: insert one dummy doc under system tenant, query as a different tenant, verify it shows in results.

## 3. Ingestion pipeline

- [ ] 3.1 `scripts/ingest-youtube-channel.ts` — CLI flags: `--channel <handle>`, `--limit <N>` (default 0 = all), `--dry-run`.
- [ ] 3.2 Step A — list videos via `yt-dlp --flat-playlist --print "%(id)s\t%(title)s\t%(duration)s\t%(upload_date)s"`. Parse + filter shorts (duration < 60s).
- [ ] 3.3 Step B — idempotency check: for each video id, `findFirst` on KnowledgeDocument by `sourceMeta.youtubeVideoId`. Skip if found.
- [ ] 3.4 Step C — fetch captions for one video: `yt-dlp --write-auto-sub --sub-lang en --skip-download --convert-subs vtt -o "/tmp/<id>.%(ext)s" <video_url>`. Parse the .vtt file. If no English caption file is produced, log `no_english_captions` and skip.
- [ ] 3.5 Step D — clean transcript: strip VTT headers + cue timestamps, deduplicate consecutive overlapping lines, join into a single paragraph string.
- [ ] 3.6 Step E — chunk via existing `chunkText()`. Confirm each chunk ≤ ~1024 chars.
- [ ] 3.7 Step F — embed each chunk via existing `embedBatch()`. Insert into pgvector column via raw SQL (same pattern as elsewhere in the codebase).
- [ ] 3.8 Step G — persist `KnowledgeDocument` row with `sourceMeta: { youtubeVideoId, channel, title, publishedAt, durationSeconds, url }`, `status: "ready"`, `chunkCount: N`.
- [ ] 3.9 Wrap per-video work in try/catch — on failure delete partial KnowledgeDocument + chunks, log + continue.
- [ ] 3.10 Concurrency: process videos in batches of 5 via `Promise.all`. DB writes serialised within each video.

## 4. Phase 1 ingest (validation)

- [ ] 4.1 Run `scripts/ingest-youtube-channel.ts --channel @NickTheriot --limit 50`.
- [ ] 4.2 Verify in DB: 50 KnowledgeDocument rows, each with chunkCount > 0, status = "ready". No orphans.
- [ ] 4.3 Pick 5 representative chunks at random; read them to confirm cleaning quality is acceptable (no timestamps, no obvious garbage).
- [ ] 4.4 Manual AI-chat probe: ask 5 typical Thai questions ("ทำ scale บูสต์ยังไง?", "rapid testing creative คืออะไร?", "งบ daily ต่ำสุดควรเริ่มเท่าไหร่?") and confirm `searchKnowledge` returns relevant Nick chunks.
- [ ] 4.5 Inspect AI chat output: does it cite the video title + URL? If not, update the chat system prompt to instruct citation format.

## 5. Phase 2 ingest (full channel — defer until Phase 1 quality is OK)

- [ ] 5.1 Run `scripts/ingest-youtube-channel.ts --channel @NickTheriot` (no limit).
- [ ] 5.2 Watch logs for OpenAI rate-limit errors; if any, lower concurrency.
- [ ] 5.3 Verify final document count ≈ (928 − shorts − no-captions).
- [ ] 5.4 Re-run E2E AI chat probe to confirm broader coverage.

## 6. AI chat citation surface

- [ ] 6.1 Inspect `searchKnowledgeTool` output shape — does it pass back `documentTitle` and `sourceMeta`?
- [ ] 6.2 If not, extend the tool result to include `videoUrl` + `videoTitle` so the AI can cite naturally.
- [ ] 6.3 Update the AI system prompt to instruct: "When citing system knowledge, format as 'แหล่งอ้างอิง: {title} → {url}' on its own line."
- [ ] 6.4 Test 3 chat scenarios to confirm citations show.

## 7. Documentation + memory

- [ ] 7.1 Add a short README inside `openspec/specs/system-knowledge-base/` explaining the system-tenant pattern + how to add a new channel.
- [ ] 7.2 Write a memory entry (auto-memory) noting that Nick Theriot's content is the foundation of AdsLab's RAG and citing the system-tenant slug.

## 8. OpenSpec archive

- [ ] 8.1 Mark tasks complete.
- [ ] 8.2 `openspec status --change add-knowledge-base-nick-theriot` confirms isComplete=true.
- [ ] 8.3 Sync delta spec to `openspec/specs/system-knowledge-base/spec.md`.
- [ ] 8.4 Archive change to `openspec/changes/archive/YYYY-MM-DD-add-knowledge-base-nick-theriot/`.

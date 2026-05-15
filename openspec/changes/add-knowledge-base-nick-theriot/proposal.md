## Why

AdsLab's AI chat already exposes a `searchKnowledge` tool, but the knowledge base is empty — the agent has nothing canonical to cite when a user asks "how do I scale a Facebook ad?" or "what's a winning creative structure?". Founder identified **Nick Theriot's YouTube channel** (@NickTheriot, ~928 videos) as the single most influential source for his own Meta-advertising methodology. Ingesting that channel turns AdsLab's AI from a generic LLM into one that speaks with the same playbook the founder uses daily.

This is also the cheapest, fastest way to build a credible Thai-agency-focused knowledge moat. Hand-curated FAQ never reaches the depth or recency of a working practitioner's video library, and scraping Meta's own docs gives canonical-but-dry API reference rather than scaled-strategy advice.

## What Changes

- **New ingestion pipeline** at `scripts/ingest-youtube-channel.ts` — list videos via `yt-dlp`, fetch English auto-captions per video, normalise transcript text, chunk → embed → persist
- **System-tenant pattern** — a single `Tenant` row with slug `__adslab_system` owns all platform-wide knowledge. The boot-time check creates it if missing. **BREAKING-FREE:** no API exposed; only the ingest script + RAG search reference it
- **`rag.ts` cross-tenant search** — already updated in this session to query both the caller's tenant and the system tenant. Documented here for completeness
- **Source-aware citations** — KnowledgeDocument.sourceMeta now stores `{ youtubeVideoId, channel, title, publishedAt, durationSeconds, url }`. The AI surface displays "Cited Nick Theriot: 'Video title' → https://youtube.com/..." instead of a bare chunk
- **Idempotency** — re-running ingest skips videos whose youtubeVideoId already has a `KnowledgeDocument` row (uses sourceMeta JSON key match)
- **Shorts filter** — durationSeconds < 60 skipped (low signal, often re-cuts of longer videos)
- **Captions gate** — videos without English captions skipped with reason logged

## Capabilities

### New Capabilities
- `system-knowledge-base`: a platform-wide RAG corpus (under `__adslab_system` tenant) that every tenant's AI chat retrieves from in addition to its own private knowledge, plus the ingestion pipeline that populates it from external sources (YouTube channels, Meta docs, curated content)

### Modified Capabilities
<!-- No modified capabilities — searchKnowledge's underlying behaviour (return top-K chunks by cosine similarity) is unchanged; only the WHERE clause changed to include the system tenant. That's a transparent enhancement, not a contract change requiring spec delta. -->

## Impact

- **New code**: `scripts/ingest-youtube-channel.ts` (~300 lines orchestrator), `scripts/seed-system-tenant.ts` (idempotent system-tenant creator)
- **Dependencies**: `yt-dlp` (already installed at Python user-site), `openai` (already in package.json for embeddings), no new npm deps
- **Database**: zero schema changes — uses existing KnowledgeDocument + KnowledgeChunk tables. Adds one Tenant row with slug `__adslab_system`
- **Embedding cost**: ~1000-3000 chunks for Phase 1 (50-100 videos) ≈ $0.02-0.06 one-time at OpenAI's text-embedding-3-small price. Phase 2 (full 928 videos) ≈ $0.20-0.60 one-time
- **Network**: yt-dlp fetches captions per video — typically 100-200 KB per video, ~10 sec per request. 928 videos ≈ 1-3 hours of sequential fetching. Parallelisable to ~30 min with 5-10 concurrent workers
- **RAG quality**: AI chat answers backed by Nick's actual phrasing → tone matches founder's expectation; agents can cite specific videos as "evidence" instead of generic advice
- **Maintenance**: re-run ingest periodically to pick up new videos. No write-back risk since this is read-only consumption of public content

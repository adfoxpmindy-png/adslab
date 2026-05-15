## ADDED Requirements

### Requirement: A platform-wide system tenant SHALL own all globally-shared knowledge documents
The system SHALL maintain exactly one `Tenant` row whose slug is `__adslab_system`. This tenant has no human members and is never billed. Its only purpose is to own `KnowledgeDocument` rows that every other tenant's AI chat retrieves from.

#### Scenario: System tenant exists after seed
- **WHEN** `scripts/seed-system-tenant.ts` is run on a fresh database
- **THEN** a Tenant row exists with `slug = "__adslab_system"` and the script logs its `id`

#### Scenario: Seed is idempotent
- **WHEN** the seed script is run a second time
- **THEN** no duplicate Tenant row is created; the existing one is logged unchanged

### Requirement: `searchKnowledge` SHALL return chunks from both the caller's tenant and the system tenant
The RAG search function SHALL UNION the caller-tenant scope with the system-tenant scope when computing top-K matches. Ranking is by cosine similarity across the combined set — a high-similarity system-tenant chunk MAY rank above a low-similarity caller-tenant chunk.

#### Scenario: System chunks surface for cross-tenant queries
- **GIVEN** the system tenant owns a KnowledgeDocument titled "Nick Theriot — Scaling FB Ads" with a chunk discussing CBO scaling
- **WHEN** any tenant's AI chat calls `searchKnowledge(callerTenantId, "how do I scale a Facebook ad with CBO?")`
- **THEN** the response SHALL include the system-tenant chunk in the top-5 results

#### Scenario: Caller-tenant private docs still take precedence when relevant
- **GIVEN** the caller tenant owns a KnowledgeDocument with a chunk that exactly matches the query phrasing
- **WHEN** searchKnowledge runs
- **THEN** the caller-tenant chunk ranks above system-tenant chunks of lower similarity

### Requirement: The YouTube ingestion pipeline SHALL convert a channel into chunked, embedded KnowledgeDocuments
Given a YouTube channel URL, the system SHALL list its videos, fetch each video's English auto-caption transcript, chunk the cleaned transcript, embed each chunk, and persist one `KnowledgeDocument` (plus N `KnowledgeChunk` rows) per video. The Document SHALL store source metadata in `sourceMeta` JSON: `{ youtubeVideoId, channel, title, publishedAt, durationSeconds, url }`.

#### Scenario: One document per video
- **WHEN** ingest processes a channel with 50 ingestible videos
- **THEN** the database SHALL contain 50 new KnowledgeDocument rows owned by the system tenant, each with its `youtubeVideoId` in `sourceMeta`

#### Scenario: Shorts are skipped
- **GIVEN** the channel contains videos with `durationSeconds < 60`
- **WHEN** ingest runs
- **THEN** those videos are skipped without creating documents; the script logs each skip with reason `"shorts"`

#### Scenario: Videos without English captions are skipped
- **GIVEN** a video in the channel has no English auto-captions available
- **WHEN** ingest reaches that video
- **THEN** the video is skipped without creating a document; the script logs reason `"no_english_captions"`

#### Scenario: Re-run is idempotent
- **GIVEN** ingest previously processed video `abc123`
- **WHEN** ingest is run again against the same channel
- **THEN** video `abc123` SHALL NOT produce a second KnowledgeDocument; the script logs `"already_ingested"` for that video

### Requirement: Chunked transcripts SHALL be cleaned of caption timestamps and joined into prose
Raw caption output from yt-dlp contains 5-second-window snippets with timestamps and overlapping repeats. The pipeline SHALL strip timestamps, deduplicate consecutive identical lines, join all lines into a single paragraph stream, and only then pass the text to `chunkText()` for embedding-ready chunking.

#### Scenario: Timestamps stripped before chunking
- **GIVEN** a raw caption line `"00:01:23.500 --> 00:01:27.000\nso the first thing you do is..."`
- **WHEN** the cleaner processes it
- **THEN** the timestamp prefix SHALL be removed; the chunk content SHALL contain only the spoken text

#### Scenario: Consecutive duplicate lines deduplicated
- **GIVEN** auto-captions emit `"so the first"` then `"so the first thing you do"` (a common overlap pattern)
- **WHEN** the cleaner runs
- **THEN** only the longest variant SHALL survive in the cleaned text

### Requirement: Each chunk SHALL be embeddable and queryable via existing rag.ts
Each chunk produced by the pipeline SHALL be ≤ 512 tokens (per existing `chunkText` target), persisted via the existing `KnowledgeChunk` table with a 1536-dim embedding, and reachable by `searchKnowledge` without any modification to that function beyond what's already shipped.

#### Scenario: Chunks are embeddable
- **WHEN** the pipeline calls `embed(chunk.content)` for each chunk
- **THEN** the returned embedding has length 1536 and the chunk is inserted with that vector

#### Scenario: Chunks appear in retrieval after ingest
- **GIVEN** ingest completes for at least one video discussing audience expansion
- **WHEN** any tenant queries `searchKnowledge(tenantId, "should I turn on audience expansion?")`
- **THEN** at least one chunk from that video appears in the top-5 with `similarity > 0.5`

### Requirement: Ingest SHALL fail safely per-video without corrupting prior progress
A failure on a single video (network error, malformed captions, embedding API error) SHALL NOT abort the whole run. The script SHALL log the failure and continue. Partial state from the failed video (e.g. KnowledgeDocument written but chunks not yet persisted) SHALL be cleaned up before moving on.

#### Scenario: One bad video doesn't stop the batch
- **GIVEN** ingest is processing 50 videos and video #23 throws a transient network error during caption fetch
- **WHEN** the pipeline continues
- **THEN** videos 1-22 stay ingested, video 23 is logged as failed, and videos 24-50 are still attempted

#### Scenario: Partial document cleaned on failure
- **GIVEN** the KnowledgeDocument row was created but the chunk embedding API errored
- **WHEN** the pipeline catches the error
- **THEN** the orphan KnowledgeDocument SHALL be deleted so re-run can retry cleanly

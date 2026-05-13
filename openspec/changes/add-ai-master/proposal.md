# Phase 7 — AI Master (Chat + Tool Use + RAG Knowledge Base)

## Why

User feedback: *"ฟังก์ชันที่ใช้ AI ยิง Ads หรือ Optimize Ads อัตโนมัติอยู่ไหน
ที่จะมีช่องให้คุยกับ AI สั่งงานเป็นภาษาคนเลย"* และ *"เปลี่ยน AI ของเรา
ให้กลายเป็นผู้เชี่ยวชาญในการทำโฆษณา"*.

AdsLab ตอนนี้มี AI **อ่านอย่างเดียว** (Daily Report สรุปข้อมูล) — แต่ user
ต้องการ AI ที่:
1. **คุยภาษาคนได้** — สั่งงานเช่น "หยุด CPS Sale 0526", "เพิ่ม budget เป็น 500"
2. **ทำงานแทน** — execute tools (pause/resume/budget/insights) ผ่าน Meta API
3. **เป็นผู้เชี่ยวชาญ** — เรียนรู้จากเอกสาร (PDF, text, URL) ที่ tenant upload
   เพื่อตอบในบริบทธุรกิจเฉพาะของลูกค้า

นี่คือ differentiator ที่จะแยก AdsLab ออกจาก dashboard ทั่วไป — Meta Ads
Manager รุ่นใหม่ + AI Operator.

## What Changes

### 7.1 — Foundation (chat infra + 2-3 read tools)
- **DB models**:
  - `AIConversation` — per-user-per-tenant thread; many turns
  - `AIMessage` — role (user/assistant/tool), content, tokenCount, toolCalls JSON
  - `AIPersona` — tenant-level system prompt overrides
- **Floating chat panel** — Intercom-style FAB + slide-over drawer, accessible from every page
- **Streaming response** via Claude Sonnet 4.6 (analysis role) through OpenRouter
- **System prompt** = persona + tenant context (active scope, naming convention, recent campaigns)
- **2 read tools** to prove concept:
  - `listCampaigns({ status?, limit? })` — returns scoped campaigns
  - `getCampaignInsights({ campaignId, range })` — KPI snapshot

### 7.2 — Tool Suite + Safe Execution
- All read tools:
  - `listAdAccounts`, `listAudiences`, `listPixels`, `listCustomConversions`,
    `getCampaign`, `searchKnowledge` (RAG hook for 7.3)
- Mutate tools (require explicit user confirmation in chat UI):
  - `pauseCampaign`, `resumeCampaign`, `setCampaignBudget`, `setCampaignEndDate`
  - `duplicateCampaign` (re-uses existing duplicate API)
- **Confirmation flow**: AI's tool call surfaces as "AI wants to: PAUSE 'CPS Sale 0526' — [Confirm] [Cancel]" in chat
- **Audit log**: every mutate action writes a `CampaignActionLog` row with `source: "ai"` + conversation id

### 7.3 — RAG Knowledge Base
- **DB models**:
  - `KnowledgeDocument` — tenantId, title, sourceType (text/pdf/url), sourceMeta JSON, status
  - `KnowledgeChunk` — documentId, content, embedding `vector(1536)`, tokens
- **pgvector** extension on Neon
- **Embedding**: OpenAI text-embedding-3-small via OpenRouter (1536 dims)
- **Ingestion pipeline**:
  - Text paste → chunk + embed
  - PDF upload → parse with pdf-parse → chunk + embed
  - URL → fetch + extract main content → chunk + embed
- **Chunking**: ~512 tokens with 50-token overlap, sentence-aware
- **Retrieval**: cosine similarity top-K = 5, inject into system prompt
  before each AI turn
- **UI**: Settings → AI Knowledge tab — upload, list, delete documents

### 7.4 — Persona Configuration
- Settings → AI Persona section — pick / customize role + custom instructions
- Default: *"Thai media buyer expert with 10y experience optimizing Meta Ads.
  Talks in Thai by default. Concise, action-oriented."*
- Tenant context auto-injected: active scope, naming patterns, recent
  campaign performance

## Impact

**New tables**: `AIConversation`, `AIMessage`, `AIPersona`,
`KnowledgeDocument`, `KnowledgeChunk` (+ pgvector extension)

**New routes**:
- `GET/POST /api/ai/conversations` — list + create
- `POST /api/ai/conversations/[id]/messages` — send + stream
- `POST /api/ai/conversations/[id]/confirm` — confirm a pending mutate
- `GET/POST/DELETE /api/ai/knowledge-documents` — RAG CRUD
- `GET/PUT /api/ai/persona` — tenant persona

**New UI**:
- `<AIChatFAB>` + `<AIChatPanel>` — floating chat (rendered in tenant layout)
- `<AIKnowledgeCard>` + upload modal — Settings → AI tab
- `<AIPersonaCard>` — Settings → AI tab

**Modified**:
- Tenant layout — mount `<AIChatFAB>`
- Settings page — add 4th tab "AI"
- `src/lib/ai/openrouter.ts` — extend to support tool use + streaming
- `src/lib/meta/*` — expose read APIs as tool-callable functions

## Risks

1. **Tool misfire** — AI executes destructive action incorrectly →
   confirmation gate + audit log + ability to undo (Meta has no undo —
   pause is reversible, budget change requires manual revert)
2. **Token cost** — chat + RAG inflates AI spend → cap conversation
   token usage, use Haiku for routing decisions
3. **Hallucinated tool calls** — Claude calls non-existent tool / wrong
   shape → strict Zod schema validation, return helpful error to AI
4. **Embedding cost** — large PDFs cost money → user-facing chunk count
   + token estimate before ingestion
5. **PDF parsing reliability** — scanned PDFs / Thai fonts can break
   text extraction → fallback to "couldn't parse, paste text instead"

## Out of Scope (defer)

- Multi-modal (image upload in chat) — AdsLab images already in DB; defer
- Voice input
- Multi-language switch within one conversation
- Agent autonomy (act without user prompt) — too risky without
  user trust built up first; future "AI co-pilot mode" toggle
- Custom tool authoring (user defines own tools)

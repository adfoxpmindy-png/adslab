# Tasks: add-ai-master (Phase 7)

## 7.1 — Foundation (chat infra + 2 read tools)

### Schema
- [ ] `AIConversation` (id, tenantId, userId, title, archived, timestamps)
- [ ] `AIMessage` (id, conversationId, role, content, toolCalls Json?, tokensIn/Out, createdAt)
- [ ] `AIPersona` (id, tenantId@unique, role text, customInstructions, updatedAt)
- [ ] `prisma db push` + regen

### Chat infrastructure
- [ ] `src/lib/ai/tools/types.ts` — tool definition contract (name, schema, kind, handler)
- [ ] `src/lib/ai/tools/registry.ts` — central registry + dispatch
- [ ] `src/lib/ai/chat-service.ts` — orchestrates Claude tool-use loop
  - send messages, handle tool_use blocks, call registered tool, feed back
  - streaming SSE
- [ ] `POST /api/ai/conversations/[id]/messages` — server-sent events stream

### First 2 read tools
- [ ] `listCampaigns({ status?, limit? })`
- [ ] `getCampaignInsights({ campaignId, range })`

### Chat UI
- [ ] `<AIChatFAB>` — floating button bottom-right
- [ ] `<AIChatPanel>` — slide-over drawer with message list + input
- [ ] Streaming render with token-by-token append
- [ ] Tool-call rendering: show as "🔧 calling tool: listCampaigns(...)"
- [ ] Mount in tenant layout

### Smoke
- [ ] User opens chat → asks "list active campaigns" → AI calls tool → renders list

## 7.2 — Tool Suite + Safe Execution

### Read tools
- [ ] `listAdAccounts`, `listAudiences`, `listPixels`, `listCustomConversions`
- [ ] `getCampaign({ id })` — full detail
- [ ] `searchKnowledge({ query })` — RAG stub (7.3 fills it)

### Mutate tools (with confirmation)
- [ ] `pauseCampaign`, `resumeCampaign`
- [ ] `setCampaignBudget({ id, daily?, lifetime? })`
- [ ] `setCampaignEndDate({ id, endTime })`
- [ ] `duplicateCampaign({ sourceId, newName })`

### Confirmation flow
- [ ] Tool definitions tagged `kind: "read" | "mutate"`
- [ ] On mutate: chat-service pauses, surfaces "AI wants to..." card in UI
- [ ] User clicks Confirm → execute. User clicks Cancel → feed cancellation back to AI
- [ ] All executed mutates write `CampaignActionLog` with `source: "ai_chat"`

### Smoke
- [ ] "pause CPS Sale 0526" → confirmation card → confirm → Meta paused

## 7.3 — RAG Knowledge Base

### Setup
- [ ] Enable `pgvector` extension on Neon (raw SQL via prisma)
- [ ] Schema:
  - `KnowledgeDocument` (id, tenantId, title, sourceType, sourceMeta Json, status, timestamps)
  - `KnowledgeChunk` (id, documentId, content text, embedding vector(1536), tokens int)

### Embedding pipeline
- [ ] `src/lib/ai/embeddings.ts` — wrap OpenRouter embeddings endpoint
- [ ] `src/lib/ai/chunker.ts` — sentence-aware splitter, ~512 tokens with 50 overlap
- [ ] `src/lib/ai/pdf-parse.ts` — extract text from PDF buffer (npm: `pdf-parse`)
- [ ] `src/lib/ai/url-fetch.ts` — fetch + readability extract main content

### APIs
- [ ] `POST /api/ai/knowledge-documents` — body: { sourceType, text? | url? | pdfBuffer }
- [ ] `GET /api/ai/knowledge-documents` — list
- [ ] `DELETE /api/ai/knowledge-documents/[id]`

### Retrieval
- [ ] `src/lib/ai/rag.ts` — `searchKnowledge(tenantId, query, k=5)` returning chunks + scores
- [ ] Inject top-K chunks into system prompt before each AI turn (only when persona enables RAG)
- [ ] Wire `searchKnowledge` tool to use RAG so AI can explicitly query

### UI
- [ ] `<AIKnowledgeCard>` in Settings → AI tab — list + delete
- [ ] Upload modal: tabs [Paste text / Upload PDF / Add URL]
- [ ] Show chunk count + estimated cost before ingestion

## 7.4 — Persona Config

- [ ] `<AIPersonaCard>` in Settings → AI tab
- [ ] Form: role (default Thai media buyer expert), custom instructions, RAG toggle
- [ ] `GET/PUT /api/ai/persona`

## Verification
- [ ] Smoke: full conversation with read + mutate + RAG retrieval
- [ ] Browser test: chat FAB visible, panel opens, streaming renders
- [ ] Audit: mutate tools write CampaignActionLog rows
- [ ] Build + deploy

# AI Quick Boost — Tasks

## 1. Schema (~30 min)
- [x] 1.1 Add `BoostJob` model to `prisma/schema.prisma`
- [x] 1.2 `npx prisma db push` (no existing data to migrate)

## 2. URL resolution (~3 hrs)
- [x] 2.1 `src/lib/meta/url-resolver.ts` — pattern matching for reel / share-link / video / post URLs
- [x] 2.2 Follow HTTP 302 redirects for `share/v/{shortcode}` to canonical URL
- [x] 2.3 Resolve reel ID → boostable post ID via Meta `GET /{reel_id}?fields=id,from{id,name},source,permalink_url`
- [x] 2.4 Map `pageId` → `MetaAdAccount.metaAccountId` via the connection's MetaPage table
- [x] 2.5 Unit-ish smoke test against the 4 URLs the founder provided (in a script — no jest yet)
- [x] 2.6 Surface clean errors: "URL ไม่ valid", "Page นี้ไม่ได้เชื่อมกับ ad account", "ไม่มีสิทธิ์ boost reel นี้"

## 3. AI parser (~2.5 hrs)
- [x] 3.1 `src/lib/ai/boost-parser.ts` — Claude Sonnet via OpenRouter (use existing `aiChat` helper)
- [x] 3.2 Define zod schema for parsed intent — includes `kpi` (nullable) and `purpose` (nullable)
- [x] 3.3 System prompt + few-shot examples (Thai patterns: "โพสละ", "ทั้งหมด", "พรุ่งนี้", "วันนี้ 5 ทุ่ม", "ให้ได้ X views", "CPV ไม่เกิน Y", time-zone Asia/Bangkok)
- [x] 3.4 Test against the founder's prompt + 2-3 variants
- [x] 3.5 Handle ambiguity: surface "assumption" flags + missing-KPI/purpose warnings

## 4. Brief builder + bulk executor (~2 hrs)
- [x] 4.1 `src/lib/boost/brief-builder.ts` — combine parser output + resolved URLs into BoostBrief[]
- [x] 4.2 Auto-generate campaign name, defaults for objective/billing/optimization goal
- [x] 4.3 Calculate start_time + end_time + lifetime budget correctly (Bangkok TZ math)
- [x] 4.4 `src/lib/boost/execute.ts` — Promise.allSettled over briefs → call existing `createCampaign()` (always PAUSED)
- [x] 4.5 Persist `BoostJob` row with full audit trail before + after execute

## 5. API routes (~1 hr)
- [x] 5.1 `POST /api/boost/plan` — { promptText } → { briefs[], jobId, warnings[] }
- [x] 5.2 `POST /api/boost/execute` — { jobId, confirmedBriefs[] } → { results[] } (per-brief success/error)
- [x] 5.3 `POST /api/meta/campaigns/[id]/resume` already exists — verify, otherwise add

## 6. UI — /boost page (~5-6 hrs)
- [x] 6.1 `src/app/t/[tenantSlug]/boost/page.tsx` server entry
- [x] 6.2 `src/components/tenant/boost-client.tsx` — textarea, paste button, submit
- [x] 6.3 Confirmation card stack — per-campaign editable fields (name, account, budget, end-time, status pill)
- [x] 6.4 Per-card "ลบ" button (drop from plan)
- [x] 6.5 **KPI + Purpose section** — at top of confirmation page, prominent display. If parser returned null, show editable form fields with helpful placeholders ("ตัวอย่าง: 10,000 views" / "ตัวอย่าง: ทดสอบ creative ก่อน launch"). "เปิดทันที" button is DISABLED until both are filled.
- [x] 6.6 Bottom action row: "สร้างเป็น Draft (PAUSED)" + "ยืนยันใช้เงินจริง ฿X,XXX" (latter shows total + requires KPI/purpose filled)
- [x] 6.7 Loading + error states (per brief)
- [x] 6.8 Success view: link to each campaign + "บูสต์งานใหม่"

## 7. Sidebar nav + discovery
- [x] 7.1 Add "บูสต์ด่วน" item to `sidebar-nav-items.ts` with Zap icon
- [x] 7.2 Add tile in `/tools` page linking here

## 8. Specs
- [x] 8.1 Write `specs/ai-quick-boost/spec.md` — capability contract

## 9. Verify
- [x] 9.1 Type-check passes
- [x] 9.2 E2E test on founder's real 31-account tenant + the exact 4 URLs given
- [x] 9.3 Verify created campaigns appear in `/campaigns` table with correct status, budget, end-time
- [x] 9.4 Verify Meta sees them as boosted reels (not page-post link ads)

## 10. Ship
- [x] 10.1 Commit + push
- [x] 10.2 Archive change

## Out-of-scope (later)
- AI Chat tool-call integration (Phase 2 — separate change `add-ai-chat-boost-tool`)
- Boost job history page (`/boost/history`)
- Re-run/retry UI for failed briefs
- Boost templates ("for Lipdaa client always use account X + add 10% interest stack")

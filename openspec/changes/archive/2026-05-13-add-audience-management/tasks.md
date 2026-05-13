# Tasks: add-audience-management (Stage 4)

ผมจะ ship **Phase 4a** เริ่มต้น (Listing + Customer List upload)
แล้วค่อยทำ 4b (Lookalike + Pixel audiences) + 4c (Pixel management)

---

## Phase 4a — Listing + Customer List upload

### Task 4a.1 — Schema: AudienceCreationLog (audit) (30 นาที)
- [x] Model `AudienceCreationLog`: id, tenantId, userId, metaAccountId, audienceId (Meta), name, subtype, sourceType, sizeAtCreation, createdAt
- [x] Index by tenantId + createdAt
- [x] `prisma db push` + regenerate

### Task 4a.2 — API: list audiences enhanced (45 นาที)
- [x] Existing `/api/meta/audiences?metaAccountId=` ดีอยู่แล้ว — เพิ่ม `?accountIds=csv` รองรับ multi-account
- [x] Endpoint: `GET /api/audiences?tenantSlug=` รวมทุก account

### Task 4a.3 — Audiences page (`/t/<slug>/audiences`) (2 ชม.)
- [x] Server component fetch audiences ทุก ad account
- [x] Client `AudiencesClient`: filter by account + filter by subtype + search
- [x] Table แต่ละ row: name, subtype badge, approximate_count, account
- [x] Empty state พร้อมปุ่ม "+ สร้าง Audience"
- [x] Sidebar nav: เพิ่ม "Audiences" item

### Task 4a.4 — Create Custom Audience modal (1.5 ชม.)
- [x] Modal เลือก source type: [Customer list / Pixel / Lookalike]
- [x] เลือก Customer list → step ถัดไป (Phase 4a)
- [x] เลือก Pixel / Lookalike → wired in Phase 4b

### Task 4a.5 — Customer List upload flow (4 ชม.)
- [x] Upload CSV → parse client-side (PapaParse หรือ native)
- [x] Detect email vs phone column (auto + manual override)
- [x] Validate: ≥ 100 rows total
- [x] Hash ฝั่ง client: SHA-256(lowercase(trim(value)))
- [x] Phone normalize เป็น E.164 (+66...) ก่อน hash
- [x] Show count + sample (first 3 hashed → reassure user PII ไม่ผ่าน server)

### Task 4a.6 — API: create custom audience + upload hashed users (2 ชม.)
- [x] `POST /api/meta/audiences/customer-list` — body: { metaAccountId, name, description?, hashedEmails[], hashedPhones[] }
- [x] Server: `POST /act_<id>/customaudiences` (subtype=CUSTOM, customer_file_source=USER_PROVIDED_ONLY)
- [x] Server: `POST /<new_audience_id>/users` แบ่ง batch 10k entries/call
- [x] AudienceCreationLog เก็บ
- [x] Invalidate audience cache สำหรับ account นี้

### Task 4a.7 — Delete audience action (45 นาที)
- [x] Delete button ในแต่ละ row (confirm dialog)
- [x] API: `DELETE /api/meta/audiences/[id]`
- [x] Server: `DELETE /<audience_id>` ใน Meta
- [x] Log to AudienceCreationLog as `action: DELETE`

### Task 4a.8 — Smoke test + deploy (1.5 ชม.)
- [x] `npm run build` ผ่าน
- [x] Deploy ครั้งแรก (Phase 4a)
- [ ] User smoke test (after 4b+4c combined deploy)

---

## Phase 4b — Lookalike + Pixel audiences

### Task 4b.1 — List Pixels per ad account
- [x] `GET /act_<id>/adspixels` (Meta endpoint)
- [x] API: `/api/meta/pixels?tenantSlug=&metaAccountId=`

### Task 4b.2 — Create Lookalike modal
- [x] Pick source (custom audience) — same-account, non-Lookalike, ≥100 size
- [x] Pick country (Thailand default)
- [x] Pick size: 1% / 3% / 5% / 10%
- [x] `POST /act_<id>/customaudiences` with subtype=LOOKALIKE + origin_audience_id + lookalike_spec

### Task 4b.3 — Create Website (Pixel) audience modal
- [x] Pick pixel
- [x] Pick retention: 7/14/30/60/90/180 days
- [x] Pick rule: All visitors / URL contains / Event = ...
- [x] `POST /act_<id>/customaudiences` with subtype=WEBSITE + rule JSON

### Task 4b.4 — Wire Pixel selection back to Campaign Builder
- [x] In Stage 3 Campaign Builder SALES section, unlock OFFSITE_CONVERSIONS / VALUE goals
- [x] Add `promoted_object.pixel_id` + `custom_event_type` to ad set body when pixel selected
- [x] UI: Pixel + event picker visible when conversion goal selected
- [x] Server-side validation: pixel-based goals require pixelId + customEventType

---

## Phase 4c — Pixel management UI

### Task 4c.1 — Pixel list page
- [x] "Pixels" tab inside `/audiences` (no separate route)
- [x] Fan-out fetch across all ad accounts
- [x] Per-account filter
- [x] Show name, ID, last fired time, unavailable badge

### Task 4c.2 — Install code modal (copy-paste)
- [x] "Copy code" button on each pixel row
- [x] Modal shows install snippet in monospace pre
- [x] Clipboard copy with feedback

### Task 4c.3 — Create new pixel
- [x] "+ สร้าง Pixel" button (OWNER/MEDIA_BUYER only)
- [x] Pick ad account + name
- [x] `POST /act_<id>/adspixels` (Meta endpoint)
- [x] On success: refresh list + auto-open install-code modal

### Task 4c.4 — Recent events summary (24h count by event)
- [ ] Deferred — needs Meta Pixel `/stats` endpoint, lower priority than core flows

---

## Phase 4d — Pixel sharing + Custom Conversions

### Task 4d.1 — Share Pixel across ad accounts in same BM
- [x] API: `POST /api/meta/pixels/[pixelId]/share` (uses Meta /shared_accounts)
- [x] UI: Share modal on each Pixel — pick target ad account in same BM
- [x] Dedupe Pixels in list by ID, show "ใช้กับ N accounts: ..."
- [x] BM-level Pixel count display (X/5 limit indicator)
- [x] Banner explaining BM Pixel cap + share workflow

### Task 4d.2 — Custom Conversions (URL-rule → event)
- [x] API: `GET/POST /api/meta/custom-conversions`
- [x] API: `DELETE /api/meta/custom-conversions/[id]`
- [x] UI: 3rd tab "Custom Conversions" in /audiences
- [x] Create modal: pick Pixel + name + URL rule (contains/equals/not-contains) + event category
- [x] Delete confirmation flow
- [x] List with rule preview (human-readable)

### Task 4d.3 — Campaign Builder uses Custom Conversions
- [x] In SALES → Conversions/Value goal: toggle between Standard event vs Custom Conversion
- [x] Fetch Custom Conversions filtered by selected Pixel
- [x] Backend: `promoted_object.custom_conversion_id` (mutually exclusive with custom_event_type)
- [x] Validation: pixel-based goal requires pixelId + (customEventType OR customConversionId)

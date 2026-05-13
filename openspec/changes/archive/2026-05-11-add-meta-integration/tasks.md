# Tasks: add-meta-integration

แต่ละ task ออกแบบให้ใช้เวลา 2-4 ชั่วโมง และ system ยัง deployable หลังจบ task

> 🚨 **Task 1 (Meta App setup) คือ founder action** — รอ Meta review parallel กับ Task 2-13 ทาง code

---

## Task 1 — Meta App setup + Submit App Review (founder action, 2-3 ชม.)
**Goal:** Meta App พร้อม + submit review (รอ 1-3 wk parallel)

**🛑 ต้องเตรียมก่อน:**
- บัญชี Facebook ของ founder (ผูกกับ Meta Business Manager 31 ad accounts)
- เอกสาร DBD/ภพ.20 ของบริษัท (สำหรับ business verification)
- โลโก้ AdsLab (1024x1024) — ถ้าไม่มี ใช้ placeholder

- [x] ไปที่ https://developers.facebook.com → "My Apps" → "Create App"
- [x] เลือก **Use Case = "Other"** → **App Type = "Business"**
- [x] ตั้งชื่อ App: `AdsLab` (หรือชื่อที่ user จะเห็นใน OAuth screen)
- [x] เพิ่ม Product: **Facebook Login** + **Marketing API**
- [x] ตั้ง OAuth Redirect URI: `https://adslab-theta.vercel.app/api/meta/oauth/callback`
- [x] App Settings → Basic:
  - App Icon (1024x1024)
  - Privacy Policy URL: `https://adslab-theta.vercel.app/privacy`
  - Terms of Service URL: `https://adslab-theta.vercel.app/terms`
  - Category: "Business and Pages"
- [x] Business Verification (Settings → Business Verification) — upload DBD/ภพ.20
- [x] App Review → Request Permissions:
  - `ads_read`
  - `ads_management`
  - `business_management`
  - `pages_read_engagement`
- [x] เขียน use case description ภาษาอังกฤษ + ทำ demo video (~3 นาที)
- [x] เก็บ `App ID` + `App Secret` ไว้ส่งให้ผม

**Verify:** Meta App อยู่สถานะ "In Review" + founder ได้ App ID + App Secret

---

## Task 2 — Privacy Policy + Terms of Service pages (2-3 ชม.)
**Goal:** มีหน้า legal ที่ Meta review ต้องการ

- [x] ร่าง Privacy Policy ภาษาอังกฤษ + ไทย (template ที่ผมจะสร้าง)
- [x] ร่าง Terms of Service ภาษาอังกฤษ + ไทย
- [x] สร้างหน้า `/privacy` (server component, static content)
- [x] สร้างหน้า `/terms` (server component, static content)
- [x] เพิ่มลิงก์ใน footer ของหน้า public (signup, login, verify-email)

**Verify:** เปิด `/privacy` และ `/terms` บน production URL ได้ + เนื้อหาครอบคลุม Meta requirements (data collection, user rights, contact)

---

## Task 3 — Database schema: MetaConnection + MetaAdAccount (2 ชม.)
**Goal:** Schema สำหรับเก็บ connection + cached accounts

- [x] เพิ่ม `MetaConnection` model:
  ```prisma
  id, tenantId UNIQUE, accessTokenEncrypted, tokenExpiresAt,
  metaUserId, metaUserName, connectedByUserId, connectedAt, lastSyncedAt
  ```
- [x] เพิ่ม `MetaAdAccount` model (cache):
  ```prisma
  id, metaConnectionId, metaAccountId UNIQUE (per connection),
  name, currency, timezoneName, accountStatus,
  businessId, businessName nullable, lastFetchedAt
  ```
- [x] เพิ่ม relations + indexes (`@@unique([metaConnectionId, metaAccountId])`)
- [x] รัน migration: `npm run db:migrate -- --name add_meta_connection`

**Verify:** Prisma Studio แสดง 2 tables ใหม่ + relations ถูกต้อง

---

## Task 4 — Crypto helper: token encryption (2-3 ชม.)
**Goal:** ฟังก์ชันกลางสำหรับ encrypt/decrypt access token

- [x] สร้าง `src/lib/crypto/aes.ts` — AES-256-GCM ผ่าน `node:crypto`
- [x] Key derivation: `HKDF(SESSION_SECRET, salt="adslab-meta-token-v1")` — ห้ามใช้ SESSION_SECRET ตรงๆ
- [x] `encrypt(plaintext: string): string` returns base64(iv + tag + ciphertext)
- [x] `decrypt(ciphertext: string): string` parses + verifies tag
- [x] Test: encrypt → decrypt round-trip ทำงาน + ทดสอบ tamper resistance

**Verify:** Unit test in `scripts/test-crypto.ts` (ลบหลัง verify)

---

## Task 5 — Meta types + Graph API wrapper (3-4 ชม.)
**Goal:** Typed wrapper รอบ Meta Graph API พร้อม error handling

- [x] สร้าง `src/lib/meta/types.ts` — interfaces:
  ```ts
  MetaAdAccount, MetaUser, MetaTokenResponse, MetaErrorResponse, MetaApiError
  ```
- [x] สร้าง `src/lib/meta/graph-api.ts`:
  - `graphFetch<T>(path, { method, body, accessToken })` — wrapper รอบ fetch
  - Auto-prepend base URL + version (`https://graph.facebook.com/v23.0`)
  - Parse Meta error responses → throw typed `MetaApiError`
  - Rate limit handling: HTTP 429 → exponential backoff (1s, 2s, 4s) max 3 retries
  - Token expiry detection: error code 190 → throw `MetaTokenExpiredError`
- [x] env: `META_GRAPH_VERSION=v23.0`

**Verify:** Mock fetch + test happy path + 429 retry + 190 token expired

---

## Task 6 — OAuth flow: start endpoint (2-3 ชม.)
**Goal:** Endpoint ที่สร้าง Meta OAuth URL + redirect

- [x] `GET /api/meta/oauth/start`:
  - require session + OWNER role on tenant
  - Generate state: HMAC-signed payload `{ tenantId, userId, expiresAt: now+10min }` ผ่าน SESSION_SECRET
  - Build URL: `https://www.facebook.com/v23.0/dialog/oauth?client_id=...&redirect_uri=...&scope=ads_read,ads_management,business_management,pages_read_engagement&state=...&response_type=code`
  - Redirect (HTTP 307) ไปยัง URL
- [x] env: `META_APP_ID`, `META_APP_SECRET`
- [x] Helper `src/lib/meta/oauth.ts` — `buildOAuthUrl()`, `signState()`, `verifyState()`

**Verify:** Hit `/api/meta/oauth/start` while logged in as OWNER → 307 to facebook.com with valid URL params

---

## Task 7 — OAuth flow: callback endpoint (3-4 ชม.)
**Goal:** Receive code, exchange for token, save MetaConnection

- [x] `GET /api/meta/oauth/callback?code=...&state=...`:
  - Verify state (HMAC + expiry) → ถ้า invalid → redirect to `/login?error=oauth_state`
  - Exchange code → access token: `GET /v23.0/oauth/access_token?client_id=...&client_secret=...&redirect_uri=...&code=...`
  - Exchange short-lived token → long-lived: `GET /v23.0/oauth/access_token?grant_type=fb_exchange_token&...`
  - Fetch Meta user info: `GET /v23.0/me?fields=id,name`
  - Encrypt token + upsert MetaConnection (delete existing + create new)
  - Redirect to `/t/<slug>/settings/integrations?connected=1`
- [x] Handle errors: user cancelled (`error=access_denied`), invalid code, network error

**Verify:** End-to-end OAuth flow ทำงานใน Dev Mode ของ Meta App

---

## Task 8 — Client: list ad accounts + sync (3 ชม.)
**Goal:** High-level function ที่ดึง ad accounts จาก Meta + update cache

- [x] `src/lib/meta/client.ts`:
  - `getConnection(tenantId)` → decrypt + return connection
  - `listAdAccounts(connection)` → fetch `/me/adaccounts?fields=id,name,currency,timezone_name,account_status,business{id,name}&limit=100` (handle pagination)
  - `syncAdAccounts(connection)` → fetch + upsert into `MetaAdAccount` table + update `lastSyncedAt`
  - `disconnect(connection)` → delete MetaConnection (cascade deletes accounts)
- [x] Pagination handling: follow `paging.next` until done

**Verify:** Run script that calls `syncAdAccounts` with founder's token → DB เห็น 31 accounts

---

## Task 9 — API: connection status + sync + disconnect (2-3 ชม.)
**Goal:** API ที่ frontend เรียกเพื่อจัดการ connection

- [x] `GET /api/meta/connection`:
  - require session + tenant member
  - return `{ connected: bool, connection?: { metaUserName, connectedAt, lastSyncedAt, accountCount }, accounts?: [...] }`
- [x] `POST /api/meta/sync`:
  - require OWNER role
  - run `syncAdAccounts()` → return updated list
- [x] `POST /api/meta/disconnect`:
  - require OWNER role
  - run `disconnect()` → return `{ ok: true }`

**Verify:** All 3 endpoints return correct shape; non-OWNER ได้ 403 บน sync/disconnect

---

## Task 10 — Settings page UI (3-4 ชม.)
**Goal:** หน้าให้ OWNER กด Connect/Sync/Disconnect + ดู connection

- [x] เพิ่ม route: `src/app/t/[tenantSlug]/settings/layout.tsx` — settings sub-shell
- [x] เพิ่ม route: `src/app/t/[tenantSlug]/settings/integrations/page.tsx` (server component):
  - Fetch connection state via `getConnection()`
  - Pass to `<MetaConnectionCard />` (client component)
- [x] `src/components/tenant/meta-connection-card.tsx` (client):
  - 3 states: not connected / connecting / connected
  - "Connect Meta" button → navigates to `/api/meta/oauth/start`
  - "Sync now" button → POST `/api/meta/sync` + refresh
  - "Disconnect" button → confirm dialog + POST `/api/meta/disconnect`
  - แสดงรายการ ad accounts (name, account ID, business name) ในตาราง
- [x] Toast feedback (ใช้ sonner) ทั้ง success + error
- [x] หากไม่ใช่ OWNER: ซ่อนปุ่ม Connect/Sync/Disconnect — แสดงแค่ status

**Verify:** Visual test — OWNER vs MEDIA_BUYER vs VIEWER เห็นต่างกันถูกต้อง

---

## Task 11 — Dashboard "Connect Meta" CTA (1-2 ชม.)
**Goal:** Empty-state ที่ดึงดูดให้ user connect

- [x] Update `src/app/t/[tenantSlug]/dashboard/page.tsx`:
  - ถ้ายังไม่ connect → แสดงปุ่มใหญ่ "Connect Meta to see your campaigns"
  - ถ้า connect แล้ว → แสดง KPI placeholder + รายชื่อ accounts (count + names)
- [x] Sidebar: enable "Settings" link (เคยเป็น "เร็วๆ นี้")

**Verify:** ก่อน/หลัง connect → dashboard เปลี่ยน UI อย่างเหมาะสม

---

## Task 12 — Token refresh logic (2 ชม.)
**Goal:** Auto-refresh access token เมื่อใกล้หมดอายุ

- [x] ใน `client.ts` ทุกฟังก์ชันที่เรียก Graph API:
  - ตรวจ `connection.tokenExpiresAt` < now + 1 day → call refresh ก่อน
- [x] `refreshToken(connection)` — Meta long-lived tokens หมดอายุ 60 วัน — refresh ก่อนหมด
- [x] ถ้า `MetaTokenExpiredError` thrown → mark connection as `status: 'expired'` + ส่ง notification (TODO Phase 2)
- [x] Settings UI แสดง warning เมื่อ token expired → suggest reconnect

**Verify:** Mock เวลา + ทดสอบ refresh trigger ที่ขอบ 1 วัน

---

## Task 13 — E2E test suite (2-3 ชม.)
**Goal:** เพิ่ม Meta integration scenarios เข้า `scripts/e2e-test.ts`

- [x] `meta.no-connection.dashboard` — ก่อน connect → dashboard แสดง CTA
- [x] `meta.oauth.start.requires-owner` — MEDIA_BUYER hit `/api/meta/oauth/start` → 403
- [x] `meta.oauth.start.requires-owner` — OWNER hit → 307 redirect to facebook.com
- [x] `meta.connection.endpoint` — GET `/api/meta/connection` return shape ถูกต้อง
- [x] `meta.disconnect.requires-owner` — non-OWNER → 403
- [x] `meta.callback.bad-state` — invalid state → 400
- [x] Update scripts/e2e-test.ts + run `npm run test:e2e`

**Verify:** ทุก scenario ใหม่ผ่าน

---

## Definition of Done

- [x] Task 1-13 ผ่านครบ
- [x] Acceptance criteria ใน `proposal.md` ผ่านครบ
- [x] Founder ทดสอบ flow บน production: ล็อกอิน → Settings → Connect Meta → เห็น 31 accounts ในรายการ
- [x] E2E tests ทั้ง suite ผ่าน (foundation 22 + meta integration ~10)
- [x] Proposal นี้ถูก archive (move ไป `openspec/changes/archive/`) + เพิ่ม spec `openspec/specs/meta-integration/spec.md`

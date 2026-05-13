# Proposal: Add Meta Integration (Direct Marketing API)

**Phase:** 1
**Status:** Draft — awaiting founder approval
**User-visible outcome (1 sentence):** Tenant owner กดปุ่ม "Connect Meta" → ผ่าน OAuth ของ Meta → AdsLab แสดงรายการ Meta ad accounts ที่เชื่อมต่อแล้วในหน้า Settings และพร้อมให้ feature อื่นๆ ดึงข้อมูลไปใช้

---

## 1. ทำไมต้องมี proposal นี้ + ทำไมต้อง direct API

Phase 1 features ทุกตัวที่เหลือ — Daily Report, Optimization, Chat, Dashboard — ต้องการ Meta data ทั้งหมด ถ้าไม่มีการเชื่อมต่อ Meta ที่เชื่อถือได้ proposal อื่นๆ build ต่อไม่ได้

**ทำไม Direct Meta Marketing API (ไม่ใช่ Pipeboard wrapper):**
- **Max features:** Meta Graph API มี 1,000+ endpoints; Pipeboard wrap แค่ 29 tools → ตัด ceiling ออก
- **Max revenue:** Enterprise customers ต้องการ data isolation guarantee → direct API ขายได้ tier ฿15K+/mo
- **Zero onboarding friction:** ลูกค้าเห็นแค่ "Connect Meta" → OAuth popup → done (ไม่ต้องสมัคร Pipeboard เพิ่ม)
- **Cost:** Meta API ฟรี; Pipeboard cost จะบีบ margin หรือต้อง pass-through ลูกค้า
- **Vendor independence:** ไม่ขึ้นกับ Pipeboard pricing/uptime/ToS

> Pipeboard $99/mo subscription ของ founder ยังคงอยู่ — ใช้เป็น dev tool ส่วนตัวเท่านั้น ไม่อยู่ใน AdsLab code path

---

## 2. ขอบเขตของ change นี้

### ✅ In scope

**Meta App setup (founder action items):**
- สร้าง Meta App ที่ developers.facebook.com
- เลือก use case = Marketing API
- ตั้งค่า OAuth Redirect URI = `${APP_URL}/api/meta/oauth/callback`
- Submit business verification (ใช้ DBD info ของ business คุณ)
- Submit App Review for permissions: `ads_read`, `ads_management`, `business_management`, `pages_read_engagement`

**Database:**
- เพิ่ม `MetaConnection` model — 1 connection ต่อ tenant
- เพิ่ม `MetaAdAccount` model — cache รายชื่อ ad accounts ของแต่ละ connection

**Backend helpers (`src/lib/meta/`):**
- `types.ts` — shared interfaces (AdAccount, Campaign, Insight)
- `graph-api.ts` — typed wrapper รอบ Meta Graph API (handles rate limits, errors, retries)
- `oauth.ts` — OAuth start URL builder + callback handler
- `token-storage.ts` — encrypt/decrypt access token + refresh logic
- `client.ts` — high-level functions: `listAdAccounts()`, `refreshToken()`, `disconnect()`

**API endpoints:**
- `GET /api/meta/oauth/start` — สร้าง Meta OAuth URL + state, redirect user
- `GET /api/meta/oauth/callback` — รับ code, แลก token, save MetaConnection, redirect to settings
- `GET /api/meta/connection` — สถานะ connection ของ tenant ปัจจุบัน + รายการ accounts
- `POST /api/meta/sync` — refresh รายการ ad accounts จาก Meta (manual trigger)
- `POST /api/meta/disconnect` — ลบ connection (with confirm)

**UI:**
- `/t/[tenantSlug]/settings/integrations` — หน้า Settings ที่มีปุ่ม Connect Meta + แสดง connection status
- `/t/[tenantSlug]/dashboard` — เพิ่ม empty-state "Connect Meta to start" CTA (replace placeholder ปัจจุบัน) เมื่อยังไม่มี connection
- Sidebar: เปลี่ยน "Settings (เร็วๆ นี้)" → enabled link

**Security:**
- Access token encrypted ใน DB (AES-256-GCM ผ่าน `node:crypto`)
- State parameter ใน OAuth flow เพื่อกัน CSRF (encrypted JWT-like with `SESSION_SECRET`)
- เฉพาะ `OWNER` ของ tenant ที่ทำ Connect/Disconnect ได้ — `MEDIA_BUYER` + `VIEWER` แค่ดู

### ❌ Non-goals (proposal ถัดไป)

- ❌ Display campaign performance + KPIs → `add-unified-dashboard`
- ❌ AI features ที่ใช้ Meta data → `add-ai-daily-report`, `add-ai-optimization`, `add-ai-chat`
- ❌ Campaign creation / management UI → Phase 2
- ❌ Multiple Meta connections per tenant → Phase 2 (ตอนนี้ unique on tenantId)
- ❌ Webhook integration (Meta → AdsLab) → Phase 2
- ❌ Sync campaign data to local DB (cache) → ใน dashboard proposal

---

## 3. การตัดสินใจทางสถาปัตยกรรม

| เรื่อง | ตัดสินใจ | เหตุผล |
|--------|---------|---------|
| Library | `node-fetch` ในตัว (Next.js built-in fetch) | ไม่เพิ่ม dependency |
| Token encryption | `node:crypto` (AES-256-GCM) | Built-in, audited, no extra deps; key = derive from `SESSION_SECRET` ผ่าน HKDF |
| Token refresh strategy | On-demand: refresh ถ้า expired ก่อนเรียก API | ง่าย + ลด background jobs ใน MVP |
| Sync model | Manual + lazy: tenant กด "Sync now" หรือ ad account list pull on demand | Phase 1 — background sync ใส่ใน dashboard proposal |
| Connection scope | 1 MetaConnection ต่อ tenant (unique) | Per-tenant ตามที่ตกลง — ขยาย Phase 2 |
| OAuth state | Signed token (HMAC `SESSION_SECRET`) ใน cookie ชั่วคราว | ไม่ต้องใช้ DB; expire ใน 10 นาที |
| Role required | `OWNER` เท่านั้นสำหรับ connect/disconnect | Token = sensitive; OWNER ปกติเป็น admin ของ Meta BM |
| Permissions ขอจาก Meta | `ads_read`, `ads_management`, `business_management`, `pages_read_engagement` | ครอบคลุม Phase 1 features ทั้งหมด — minimum scope policy |
| Meta API version | `v23.0` (latest stable ณ 2026-05) | ใช้ explicit version, pin ใน env var `META_GRAPH_VERSION` |

---

## 4. Meta App Review — สิ่งที่ต้องเตรียม

founder ต้องเตรียมสิ่งเหล่านี้ก่อน submit Review:

1. **Business Verification** ผ่าน Meta Business Manager (ใช้เอกสาร DBD/ภพ.20)
2. **Privacy Policy URL** — host บน adslab-theta.vercel.app/privacy
3. **Terms of Service URL** — host บน adslab-theta.vercel.app/terms
4. **App Icon** — 1024×1024 (ใช้โลโก้ AdsLab)
5. **Demo video** — แสดงว่าฟีเจอร์ใช้งานอย่างไรในแอป (ถ่ายหน้าจอ AdsLab + commentary)
6. **Use case explanation per permission** — เขียนเป็นภาษาอังกฤษ ทำไมต้องการ `ads_management`, `ads_read`, ฯลฯ

> Review timeline: 1-3 สัปดาห์ปกติ (อาจมี request revision 1-2 รอบ)

---

## 5. ความเสี่ยง + วิธีลด

| ความเสี่ยง | ผลกระทบ | วิธีลด |
|------------|---------|--------|
| Meta App รอ review นาน | Block public launch | Submit Day 1, ทำ feature parallel ใน dev mode |
| Token rotation policy ของ Meta เปลี่ยน | API call ล้มเหลว | Refresh logic + error handler + log + alert founder |
| Meta API rate limits ทำให้ user เห็นช้า | UX แย่ | Implement exponential backoff + queue ใน `graph-api.ts` |
| Encryption key หาย → token decrypt ไม่ได้ | Connections เสีย — user ต้อง reconnect | `SESSION_SECRET` ใน Vercel + backup ที่ปลอดภัย; user reconnect via OAuth (1 click) |
| Founder dropped from BM ของลูกค้า | Pipeboard $99 ไร้ประโยชน์ | Pipeboard เป็น **dev tool** ของ founder เท่านั้น — ไม่กระทบ product |
| Meta App ถูก disable | Service down | Have backup app (or fallback Pipeboard temporarily ผ่าน feature flag) |

---

## 6. Acceptance criteria

- [ ] Founder สร้าง Meta App + submit Review สำเร็จ (manual step)
- [ ] `/api/meta/oauth/start` redirect ไป Facebook OAuth with correct scopes + state
- [ ] `/api/meta/oauth/callback` แลก code → token → save MetaConnection → redirect to `/t/<slug>/settings/integrations?connected=1`
- [ ] State parameter validate (CSRF protection) — invalid state → 400
- [ ] Access token เก็บใน DB **encrypted** ไม่ใช่ plaintext
- [ ] `listAdAccounts()` คืนรายการ ad accounts ที่ user มีสิทธิ์เข้าถึง
- [ ] หน้า Settings แสดง: connection status, connected at, list of ad accounts, ปุ่ม "Sync" + "Disconnect"
- [ ] Dashboard แสดง "Connect Meta to start" CTA ถ้ายังไม่ connect
- [ ] เฉพาะ OWNER เท่านั้นเห็นปุ่ม Connect/Disconnect (MEDIA_BUYER + VIEWER เห็นแต่ status)
- [ ] Token refresh เกิดอัตโนมัติเมื่อ token expired (ทดสอบโดย mock เวลา)
- [ ] Rate limit error (HTTP 429) → backoff + retry ไม่เกิน 3 ครั้ง
- [ ] Disconnect ลบ MetaConnection + cached ad accounts ทั้งหมด
- [ ] Reconnect ทำได้หลัง disconnect (ไม่ติด unique constraint)
- [ ] E2E test ครอบคลุม happy + failure paths ทุก endpoint

---

## 7. Open questions (รอ founder ยืนยัน)

1. **Privacy Policy + Terms of Service** — เขียนเองหรือใช้ template? *(ผมแนะนำใช้ template generator → ปรับ — ผมช่วยร่างฉบับแรกได้)*
2. **Meta App name** — แสดงให้ user เห็นตอน OAuth screen *(แนะนำ: "AdsLab" หรือ "AdsLab — Media Buyer SaaS")*
3. **App Icon** — มี logo AdsLab แล้วหรือยัง? ถ้ายังจะใช้ placeholder ก่อน?
4. **Background sync ใน Phase 1 หรือเลื่อน?** — ปัจจุบันเสนอ manual sync only *(เลื่อนไป dashboard proposal เพื่อ scope เล็ก)*

# Tasks: add-mvp-foundation

แต่ละ task ออกแบบให้ใช้เวลา 2-4 ชั่วโมง และ system ยัง deployable หลังจบ task

---

## Task 1 — Initialize Next.js project (2 ชม.) ✅ DONE
**Goal:** มีโครง Next.js 16 + TypeScript + Tailwind + shadcn/ui ที่ build ได้

- [x] Scaffold Next.js 16 (TypeScript, App Router, Tailwind v4, ESLint, Turbopack, src/)
- [x] ติดตั้ง shadcn/ui + Tailwind v4 รองรับ
- [x] ติดตั้ง components: `button`, `input`, `label`, `card`, `dropdown-menu`, `avatar`, `alert`, `sonner` (toast)
- [x] ติดตั้ง `next-themes` (มาเป็น transitive dep)
- [x] สร้าง `.env.local.example` + `.env.local` พร้อม keys

**Verify:** `npm run dev` เปิดที่ `localhost:3000` → ตอบ HTTP 200 ✅

---

## Task 2 — Prisma 7 + Neon setup (3 ชม.) ✅ DONE
**Goal:** เชื่อม Neon ได้ + migration ทำงาน + Prisma singleton พร้อมใช้ใน Next.js

- [x] ติดตั้ง: `prisma@7`, `@prisma/client@7`, `@prisma/adapter-neon`, `@neondatabase/serverless`, `dotenv-cli`
- [x] `npx prisma init --datasource-provider postgresql` (สร้าง `schema.prisma` + `prisma.config.ts`)
- [x] ตั้งค่า `DATABASE_URL` + `DIRECT_URL` ใน `.env.local`
- [x] ปรับ `prisma.config.ts` ให้โหลด `.env.local` ด้วย `dotenv` + ใส่ datasource.url
- [x] เพิ่ม npm scripts: `db:generate`, `db:migrate`, `db:migrate:deploy`, `db:studio`, `db:push`, `db:seed`

**Verify:** `npm run db:studio` ตอบ HTTP 200 ✅, TypeScript compile ผ่าน ✅

---

## Task 3 — Database schema: User / Tenant / TenantMember / EmailVerificationToken (3 ชม.) ✅ DONE (รวมกับ Task 2)
**Goal:** Schema สำหรับ multi-tenant + role + email verification

- [x] เพิ่ม `User` model (id, email, passwordHash, name, emailVerifiedAt, createdAt, updatedAt)
- [x] เพิ่ม `Tenant` model (id, name, slug, createdAt, updatedAt)
- [x] เพิ่ม `TenantMember` model (id, userId, tenantId, role: enum, createdAt)
- [x] เพิ่ม enum `Role` (`OWNER`, `MEDIA_BUYER`, `VIEWER`)
- [x] เพิ่ม `EmailVerificationToken` model (id, userId, token, expiresAt, usedAt, createdAt)
- [x] เพิ่ม indexes (email unique, tenant slug unique, composite unique on `userId+tenantId`, token unique)
- [x] รัน migration: `init` (`20260511084018_init`) — สร้างครบ 4 tables บน Neon
- [x] สร้าง `src/lib/prisma.ts` singleton ใช้ `PrismaNeon` adapter (Prisma 7 pattern)

**Verify:** เปิด Prisma Studio และเห็นทั้ง 4 tables พร้อม relations ✅

---

## Task 4 — Email infrastructure (Resend) (2 ชม.) ✅ DONE
**Goal:** ส่งอีเมลจาก server ได้ผ่าน Resend API

- [x] ติดตั้ง: `resend`, `@react-email/components` (สำหรับ template ในอนาคต), `tsx` (dev)
- [x] ตั้งค่า env vars: `RESEND_API_KEY`, `MAIL_FROM` (`onboarding@resend.dev` ในช่วง dev — เปลี่ยนเป็นโดเมนจริงตอน Phase 2)
- [x] สร้าง `src/lib/email/client.ts` — singleton Resend client
- [x] สร้าง `src/lib/email/send.ts` — `sendEmail({ to, subject, html, text })` พร้อม error handling
- [x] สร้าง template: `src/lib/email/templates/verify-email.ts` (ภาษาไทย, dub.co style — accent teal `#06B6D4`)
- [x] ทดสอบ: ส่งเมลถึง email ของ founder → ✅ Resend Message ID `60f790a3-9230-4c0a-b995-6d73865a2311`

**Verify:** Founder ได้รับเมล verify ใน inbox (or spam — Gmail บางครั้งกรอง `onboarding@resend.dev` ในตอนแรก) ✅

**Note สำหรับ Phase 2:** ต้อง verify domain ใน Resend dashboard → เปลี่ยน MAIL_FROM เป็น `noreply@yourdomain.com` เพื่อ deliverability ดีขึ้น

---

## Task 5 — Seed script (1-2 ชม.) ✅ DONE
**Goal:** Default admin + sample tenant พร้อมใช้ (verified แล้ว)

- [x] สร้าง `prisma/seed.ts` (idempotent ผ่าน `upsert`)
- [x] Seed: user `test@test.com` / `admin123` (bcryptjs hashed, `emailVerifiedAt` = now)
- [x] Seed: tenant `AdsLab Demo Agency` slug `demo` + membership `OWNER`
- [x] เพิ่ม `migrations.seed: "tsx ./prisma/seed.ts"` ใน `prisma.config.ts` (Prisma 7 ย้ายจาก `package.json`)
- [x] รัน: `npm run db:seed`

**Verify:** Seed script output ✓ User/Tenant/Membership ครบ — ✅ ทดสอบผ่าน

---

## Task 6 — Auth helpers + session (3 ชม.) ✅ DONE
**Goal:** ฟังก์ชันกลางสำหรับ hash password, session, และตรวจสิทธิ์

- [x] ติดตั้ง: `bcryptjs` (Task 5) + `iron-session`
- [x] `src/lib/auth/password.ts` — `hashPassword` / `verifyPassword` (bcryptjs, 10 rounds)
- [x] `src/lib/auth/session.ts` — `getSession` / `requireSession` / `clearSession` (iron-session, 30-day cookie)
- [x] `src/lib/auth/tenant.ts` — `requireTenantMember(slug, allowedRoles?)` returns `{tenant, role}` หรือ `notFound()`
- [x] `SESSION_SECRET` ตั้งแล้วใน `.env.local` (32 random bytes base64)

**Verify:** TypeScript compile ผ่าน ✅ (password helpers ใช้งานได้แล้วใน seed); session/tenant จะ test ผ่านการใช้งานใน Task 7-10

---

## Task 7 — Signup + email verification trigger (3-4 ชม.) ✅ DONE
**Goal:** สมัคร → สร้าง User + Tenant → ส่งเมล verify ทันที

- [x] API route `POST /api/auth/signup` พร้อม zod validation + slug generation + transaction
- [x] `src/lib/utils/slug.ts` — `toSlug()` + `resolveUniqueSlug()` (เพิ่ม `-2`, `-3` ถ้าซ้ำ)
- [x] Transaction สร้าง User + Tenant + TenantMember (OWNER) + EmailVerificationToken
- [x] Email verify ส่งผ่าน `sendEmail()` (best-effort — log error ถ้า fail)
- [x] Set session หลังสำเร็จ
- [x] Page `/signup` (`src/app/signup/page.tsx`) — Client component, dub.co style, ภาษาไทย, field errors inline
- [x] Placeholder dashboard ที่ `/t/[tenantSlug]/dashboard` (จะ replace ใน Task 11)

**Verify:** POST `/api/auth/signup` → HTTP 201 + records ใน DB + email send attempted (`onboarding@resend.dev` restriction logged correctly) ✅

---

## Task 8 — Email verification page (2 ชม.) ✅ DONE
**Goal:** User กดลิงก์ใน email → status เปลี่ยนเป็น verified

- [x] `src/lib/auth/email-verification.ts` — `verifyEmailToken()` + `sendVerificationEmail()` helpers
- [x] API `POST /api/auth/verify-email` — รับ token, ตรวจ expired/used, อัปเดต DB ใน transaction
- [x] API `POST /api/auth/resend-verification` — require session, ส่งเมลใหม่ผ่าน Resend
- [x] Page `/verify-email` (server component) — verify token ตอน load, แสดง 4 states: success / expired / used / invalid
- [x] Component `ResendButton` (client) — เรียก resend API พร้อม feedback state
- [x] หน้า redirect ไปแดชบอร์ดของ tenant แรก (อ้างจาก first TenantMember)

**Verify:** TypeScript compile ✅; flow end-to-end จะ test ผ่าน browser หลัง Task 9 (ต้อง login)

---

## Task 9 — Login + Logout (2 ชม.) ✅ DONE
**Goal:** User ที่สมัครแล้วล็อกอินกลับเข้ามาได้

- [x] API `POST /api/auth/login` — verify password, set session, return `redirectTo` ไป first tenant
- [x] API `POST /api/auth/logout` — clear session (idempotent — ตอบ 200 แม้ไม่มี session)
- [x] Page `/login` — form + Suspense-wrapped form ที่อ่าน `?next=` (สำหรับ redirect หลัง login)
- [x] **Security:** กัน user enumeration — wrong password และ email not found ตอบ generic 401 เดียวกัน
- [x] **Banner เตือน unverified** — จะติดตั้งใน Task 11 (Dashboard shell)

**Verified scenarios (E2E via API):**
1. ✅ Happy path (test@test.com / admin123) → 200 + redirectTo /t/demo/dashboard
2. ✅ Wrong password → 401 generic
3. ✅ Email not found → 401 **same** generic message
4. ✅ Missing password field → 400 zod fieldError
5. ✅ Invalid email format → 400 "รูปแบบอีเมลไม่ถูกต้อง"
6. ✅ Logout (no session) → 200 idempotent
7. ✅ Login + Logout (cookie flow) → session set then cleared

---

## Task 10 — Path-based tenant routing + proxy (3 ชม.) ✅ DONE
**Goal:** ทุก URL ภายใต้ `/t/<slug>/...` ถูก guard ด้วย session + membership

- [x] สร้าง `src/proxy.ts` (Next.js 16 ใช้ `proxy` ไม่ใช่ `middleware`) — cookie-existence check ที่ edge, redirect `/login?next=...` ถ้าไม่มี
- [x] Layout `src/app/t/[tenantSlug]/layout.tsx` — เรียก `requireTenantMember(slug)` (authoritative check)
- [x] Wrap `requireTenantMember` ด้วย React `cache()` — layout + page เรียกซ้ำได้แต่ DB hit แค่ครั้งเดียว
- [x] Login API set `redirectTo` = first tenant slug → page อ่าน `?next=` ก่อน
- [ ] **Tenant switcher** จะทำใน Task 11 (Dashboard shell + topbar)

**Verified scenarios (E2E via HTTP):**
1. ✅ No cookie + `/t/demo/dashboard` → 307 `/login?next=%2Ft%2Fdemo%2Fdashboard`
2. ✅ Valid cookie + member of `demo` → 200 OK
3. ✅ Valid cookie + non-existent slug → 404 (ไม่ leak ว่า tenant มีหรือไม่)
4. ✅ Invalid/stale cookie → 307 `/login` (layer 2 layout catch)

---

## Task 11 — Dashboard shell + theme toggle (3 ชม.) ✅ DONE
**Goal:** Layout ที่ feature ถัดไปจะวางบนนี้ + dark mode + tenant switcher

- [x] **Fonts:** เปลี่ยน Geist → Inter + IBM Plex Sans Thai (ตาม DESIGN.md)
- [x] **Theme:** primary color → teal `#06B6D4` (oklch) ทั้ง light + dark mode
- [x] `ThemeProvider` ที่ root layout (`next-themes`, attribute="class", defaultTheme="system")
- [x] `src/components/theme-toggle.tsx` — Light/Dark/System dropdown ผ่าน DropdownMenu
- [x] `src/components/tenant/sidebar.tsx` — Dashboard / Reports / Insights / Settings (placeholder + "เร็วๆ นี้" labels)
- [x] `src/components/tenant/topbar.tsx` — TenantSwitcher + ThemeToggle + UserMenu (avatar/logout)
- [x] `src/components/tenant/tenant-switcher.tsx` — Dropdown ของ user's tenants
- [x] `src/components/tenant/user-menu.tsx` — Avatar + name/email + logout
- [x] `src/components/tenant/unverified-banner.tsx` — Amber banner + ปุ่ม "ส่งเมลใหม่" (เรียก /api/auth/resend-verification)
- [x] Updated tenant layout — fetch user + memberships, render Sidebar + Topbar + Banner + children
- [x] Updated dashboard page — KPI cards (Total Spend / Impressions / Clicks / Conversions) + empty state

**Verified scenarios (E2E via HTTP):**
1. ✅ Verified user (test@test.com) → dashboard renders, NO unverified banner
2. ✅ Unverified user (e2e-signup-1) → dashboard renders WITH banner + resend button
3. ✅ Login → access (200) → logout → re-access → 307 redirect /login?next=...

**Browser testing needed (UI interactions):**
- Theme toggle (Light → Dark → System) — visual change + localStorage persistence
- Tenant switcher dropdown
- User menu dropdown
- "ส่งเมลใหม่" button in banner

---

## Task 12 — AI gateway helper (OpenRouter, hybrid Claude+Gemini) (2 ชม.) ✅ DONE
**Goal:** ฟังก์ชันกลางสำหรับเรียก LLM โดย route ไปแต่ละ model ตามความซับซ้อนของงาน

**Strategy change:** เดิมวางแผนใช้ Anthropic SDK ตรงๆ — เปลี่ยนเป็น **OpenRouter** เพราะ:
- 1 API key route ไปได้หลาย provider (Anthropic + Google + อื่นๆ)
- Hybrid strategy ลดต้นทุน: Claude สำหรับงานยาก, Gemini Flash สำหรับงานเร็ว/ถูก
- สลับ model ผ่าน env var ไม่ต้องแก้ code
- Markup ~5% เทียบ direct API — คุ้มค่าความสะดวก

- [x] ติดตั้ง: `openai` (ใช้เป็น OpenRouter client เพราะ API-compatible)
- [x] `src/lib/ai/openrouter.ts` — `aiChat({ role, system, messages, ... })` + lazy singleton
- [x] 3 roles: `analysis` (Claude Sonnet 4.6), `chat` (Gemini 2.0 Flash), `lite` (Gemini Flash Lite)
- [x] **Prompt caching**: automatic สำหรับ Anthropic models (cache_control: ephemeral) ผ่าน OpenRouter pass-through
- [x] ตั้งค่า env vars: `OPENROUTER_API_KEY`, `AI_MODEL_ANALYSIS`, `AI_MODEL_CHAT`, `AI_MODEL_LITE`

**Verified scenarios (E2E):**
1. ✅ `analysis` route → Claude Sonnet 4.6 ตอบภาษาไทย คุณภาพดีมาก (106→178 tokens, ~$0.003/call)
2. ✅ `chat` route → Gemini Flash ตอบภาษาไทยดี (41→46 tokens, ~$0.0002/call)
3. ✅ `lite` route → Gemini Flash Lite ตอบใช้ได้ (41→52 tokens, ~$0.00005/call)

**Cost projection (Phase 1, founder use only):** ~$100-150/month รวม Daily Report + Optimization + Chat

---

## Task 13 — Deploy to Vercel (2 ชม.) ✅ DONE
**Goal:** Production URL ใช้งานได้

- [x] Vercel project ผูกกับ GitHub repo `adfoxpmindy-png/adslab` (auto-deploy on push to main)
- [x] Production URL: **https://adslab-theta.vercel.app**
- [x] ตั้ง 10 environment variables ผ่าน Vercel REST API:
  - DB: `DATABASE_URL`, `DIRECT_URL`
  - Auth: `SESSION_SECRET`, `APP_URL`
  - AI: `OPENROUTER_API_KEY`, `AI_MODEL_ANALYSIS`, `AI_MODEL_CHAT`, `AI_MODEL_LITE`
  - Email: `RESEND_API_KEY`, `MAIL_FROM`
- [x] เพิ่ม `prisma generate` ใน build script (เพราะ generated client gitignored)
- [x] Migration ไม่ต้องรัน production แยก — ใช้ Neon DB เดียวกับ dev (seeded แล้ว)
- [x] **E2E test 22/22 PASS ที่ production** ✅

**Verify:** ทุก auth flow + dashboard + tenant routing ทำงานบน production URL จริง ✅

**Known issues / cleanup ในอนาคต:**
- Vercel CLI `--value` flag ใช้กับ PowerShell stdin pipe ไม่ได้ — ต้องใช้ flag หรือ REST API
- API keys (Resend, OpenRouter, Neon password) เคย expose ใน chat history — **ต้อง rotate ก่อน paid customers**

---

## Definition of Done สำหรับทั้ง proposal

- [x] ทุก task ข้างบนผ่าน (1-13)
- [x] ทุก acceptance criteria ใน `proposal.md` ผ่าน (ส่วน UI interactions ต้อง verify ใน browser)
- [x] Founder ล็อกอินบน production URL ได้ (`test@test.com` / `admin123` ที่ https://adslab-theta.vercel.app/login)
- [x] Code commit + push ขึ้น git repo (https://github.com/adfoxpmindy-png/adslab)
- [ ] **TODO:** Proposal นี้ถูกย้ายไป `openspec/changes/archive/add-mvp-foundation/` และ specs ใหม่ถูกเพิ่มใน `openspec/specs/` (รอ founder สั่ง — สามารถทำผ่าน `/openspec-archive-change`)

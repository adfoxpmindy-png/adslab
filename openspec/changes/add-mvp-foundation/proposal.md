# Proposal: Add MVP Foundation for AdsLab

**Phase:** 1 (MVP)
**Status:** Draft — awaiting founder approval
**User-visible outcome (1 sentence):** ผู้ก่อตั้งสมัครสมาชิก ล็อกอิน และเห็นแดชบอร์ดเปล่าได้ — ฟีเจอร์จริง (Meta connect, AI, KPI tracker) จะออกใน proposal ถัดไป

---

## 1. ทำไมต้องมี proposal นี้ก่อน

Phase 1 MVP มี 8 ฟีเจอร์ใหญ่ (Meta OAuth, Dashboard, KPI Tracker, AI Report, AI Optimization, AI Chat, Billing, Multi-tenant) — ทุกตัวต้องวางบนพื้นฐานเดียวกัน:
- Database schema สำหรับ user / tenant / role
- Authentication ที่ใช้งานได้
- โครง Next.js + Tailwind + shadcn/ui
- การเชื่อมต่อ Neon + Vercel Blob + Claude API

ถ้าเรากระโดดเข้าไปทำ "Meta integration" หรือ "AI Report" เลย จะติดปัญหาเพราะยังไม่มีคนล็อกอินได้ — proposal นี้คือ **"พื้น"** ที่ทำให้ proposal อื่นๆ ต่อยอดได้

---

## 2. ขอบเขตของ change นี้

### ✅ In scope (ทำในรอบนี้)
- **โครง Next.js 15** (App Router) + Tailwind + shadcn/ui
- **Prisma + Neon** เชื่อมต่อ + migration ทำงานได้
- **Database schema (เริ่มต้น):** `User`, `Tenant`, `TenantMember`, `EmailVerificationToken` (พร้อม role: Owner / MediaBuyer / Viewer)
- **Authentication:** Email + password (bcrypt + iron-session)
  - หน้า `/signup`, `/login`, `/logout`, `/verify-email`
- **Email verification:** ส่งเมลยืนยันหลัง signup ผ่าน Resend (`onboarding@resend.dev` ใน dev → custom domain ใน Phase 2)
- **Multi-tenant แบบ path-based:** URL = `/t/<tenant-slug>/...`; เมื่อ user สมัคร → สร้าง Tenant อัตโนมัติ + ตั้งเป็น Owner
- **Dashboard shell ว่าง:** `/t/<slug>/dashboard` (มี sidebar + topbar แต่ยังไม่มี widget)
- **Theme system:** Light + Dark + toggle ใน topbar (ผ่าน `next-themes`)
- **Anthropic Claude SDK helper:** ฟังก์ชันกลางสำหรับเรียก Claude พร้อม prompt caching เสมอ
- **Seed script:** admin `test@test.com` / `admin123` + tenant ตัวอย่าง (verified แล้ว)
- **Deploy บน Vercel** (พิสูจน์ว่า production deploy ได้)

### ❌ Non-goals (ไม่ทำในรอบนี้ — มี proposal ของตัวเอง)
- ❌ Meta OAuth + Pipeboard MCP → `add-meta-integration`
- ❌ Unified dashboard widgets + KPI tracker → `add-unified-dashboard`
- ❌ AI Daily Report → `add-ai-daily-report`
- ❌ AI Daily Optimization Recommendation → `add-ai-optimization`
- ❌ AI in-app chat → `add-ai-chat`
- ❌ Omise billing + 30-day trial → `add-billing`
- ❌ Password reset, 2FA → Phase 2+ (verification ทำใน Phase 1, แต่ reset ทำทีหลัง)
- ❌ Subdomain-based tenants → Phase 2+ (MVP ใช้ path-based ก่อน)
- ❌ Google / TikTok / LINE integrations → Phase 2+

---

## 3. การตัดสินใจทางสถาปัตยกรรม

| เรื่อง | ตัดสินใจ | เหตุผล |
|--------|---------|---------|
| Auth library | iron-session + bcrypt (ไม่ใช้ NextAuth) | Dependencies น้อย, แก้บั๊กง่าย, ปรับแต่งได้ตามที่ founder เข้าใจ |
| Multi-tenancy | Single DB, path-based URL (`/t/<slug>/...`), แยกด้วย `tenantId` filter ที่ API layer | ตาม CLAUDE.md — ห้ามใช้ RLS, full server-side API; path-based ง่ายกว่า subdomain ในช่วง MVP |
| Session | HTTP-only cookie, อายุ 30 วัน | ปลอดภัย, ไม่ต้องใช้ Redis ในช่วง MVP |
| Roles | enum: `OWNER` \| `MEDIA_BUYER` \| `VIEWER` | ตรงกับ feature list ที่ founder ระบุ |
| Email service | Resend (`onboarding@resend.dev` ใน dev) | ไม่ต้องรอโดเมน, free 3,000/เดือน, modern API |
| Email verification | Token-based (uuid v4), อายุ token 24 ชม., ส่งทันทีหลัง signup | มาตรฐาน + เหมาะกับ MVP |
| Theme | Light + Dark + toggle (ผ่าน `next-themes`) | Founder ขอ — UX ที่ผู้ใช้ media buyer คุ้นเคย |
| Claude model default | `claude-sonnet-4-6` สำหรับงานทั่วไป, `claude-haiku-4-5-20251001` สำหรับ chat | Balance ต้นทุน / คุณภาพ |
| Prompt caching | เปิดเสมอ ผ่าน helper กลาง | ลด cost AI ได้ 70-90% ในงานซ้ำ |

---

## 4. คำถามที่ founder ตอบแล้ว ✅

1. ✅ **Tenant URL:** Path-based (`/t/<slug>/...`)
2. ✅ **Email verification:** ทำใน Phase 1 (ผ่าน Hostatom SMTP)
3. ✅ **Theme:** Light + Dark + toggle

---

## 5. Acceptance Criteria

- [ ] `npm run dev` เปิดเซิร์ฟเวอร์ที่ `localhost:3000` ได้โดยไม่มี error
- [ ] User สมัครสมาชิกที่ `/signup` ด้วย email + password ได้
- [ ] หลังสมัคร → ระบบส่งเมล verification ผ่าน Hostatom SMTP ภายใน 30 วินาที
- [ ] User กดลิงก์ใน email → เข้า `/verify-email?token=...` → status เปลี่ยนเป็น verified
- [ ] User ที่ยังไม่ verify สามารถ login ได้ แต่จะเห็น banner เตือนใน dashboard
- [ ] User ล็อกอินที่ `/login` ได้ และ session ค้าง 30 วัน
- [ ] หลังสมัคร → ระบบสร้าง `Tenant` อัตโนมัติ พร้อม `slug` และตั้ง user เป็น `OWNER`
- [ ] User ที่ล็อกอินแล้วเข้าหน้า `/t/<slug>/dashboard` เห็น shell เปล่าๆ (sidebar + topbar)
- [ ] Theme toggle ที่ topbar สลับ Light/Dark ได้ และจำค่าใน localStorage
- [ ] User ที่ยังไม่ล็อกอินถูก redirect ไป `/login` เมื่อพยายามเข้า tenant routes
- [ ] User เข้า tenant ที่ตัวเองไม่ใช่ member ของ → ได้ 403/404
- [ ] Seed script สร้าง `test@test.com` / `admin123` + tenant ตัวอย่าง (verified แล้ว)
- [ ] Prisma migrations รันบน Neon ใหม่ได้คลีน (no errors)
- [ ] Deploy บน Vercel สำเร็จ และล็อกอิน + ดูแดชบอร์ดได้บน production URL
- [ ] Helper `getClaudeClient()` มี prompt caching เปิดอยู่ default

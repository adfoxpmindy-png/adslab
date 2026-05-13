# Tasks: add-report-scopes

ทุก task ติ๊ก ✅ แล้ว — feature live ที่ production 2026-05-12

---

## Task 1 — Schema + filter service (2 ชม.) ✅ DONE
- [x] เพิ่ม `ReportScope` model (tenantId, name unique-per-tenant, accountIds Json, campaignIds Json)
- [x] เพิ่ม `DailyReport.scopeId String?` + FK `SetNull`
- [x] เปลี่ยน unique เป็น composite `[tenantId, reportDate, scopeId]` (Postgres NULL distinct → coexistence OK)
- [x] รัน `prisma db push` + regenerate client
- [x] สร้าง `src/lib/reports/scope-filter.ts` — `applyScopeFilter(payload, filter)` ที่ตัด accounts/campaigns + re-aggregate summary

## Task 2 — Wire scope เข้า daily-report flow (1.5 ชม.) ✅ DONE
- [x] `generateDailyReport()` รับ `scopeId?` param
- [x] เปลี่ยน idempotency check จาก `findUnique` เป็น `findFirst` (รองรับ nullable scope)
- [x] เปลี่ยน upsert เป็น find-then-update/create pattern
- [x] โหลด scope name + filter → ส่งเข้า prompt
- [x] บันทึก `payloadSnapshot.scope = { id, name }` ตอน complete

## Task 3 — AI prompt scope-aware (30 นาที) ✅ DONE
- [x] เพิ่มบรรทัด `🎯 SCOPE: <name>` ในรายงาน user-message
- [x] เพิ่มกฎใน system prompt: ห้ามอ้าง campaign/account นอก scope, heading ขึ้นต้นด้วยชื่อ scope

## Task 4 — REST API (1.5 ชม.) ✅ DONE
- [x] `/api/scopes` GET (list)
- [x] `/api/scopes` POST (create) — Zod validation, role check
- [x] `/api/scopes` PATCH (update name / filter)
- [x] `/api/scopes` DELETE — onDelete SetNull ทำให้ report เก่ายังอยู่
- [x] `/api/reports/generate` รับ `scopeId` query param

## Task 5 — UI: Reports page redesign (3 ชม.) ✅ DONE
- [x] แยก `ReportsClient` เป็น client component (state + actions)
- [x] Scope dropdown ที่ toolbar
- [x] Modal สร้าง / แก้ scope: 2-column (accounts + campaigns) + ค้นหา campaign
- [x] ปุ่ม "สร้างรายงาน scope นี้" หรือ "สร้างรายงานเดี๋ยวนี้" ตาม context
- [x] List filter to `scopeId IS NULL` by default, หรือเฉพาะ scope ที่เลือก

## Task 6 — Multi-scenario smoke test (1 ชม.) ✅ DONE
- [x] `scripts/phase-scopes-smoke.ts` — 17 assertions
- [x] Unit: filter ตัด accounts + drop accounts ไม่มี campaign match + empty pass-through + re-aggregate
- [x] API CRUD ครบ
- [x] Generate scoped report → snapshot มีแค่ accounts ใน scope
- [x] วันเดียว: scoped + full-tenant coexist (NULL distinct)

## Task 7 — Deploy + verify (30 นาที) ✅ DONE
- [x] `vercel --prod`
- [x] Verify routes ใหม่บน production
- [x] Fix: toolbar UI layout (`Card` flex-col ขัดกับ flex-wrap → ใช้ `<div>` แทน)
- [x] Bug fix: maxTokens 1500 → 4000 (รายงานเคยถูกตัด)

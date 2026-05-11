# AdsLab — Product Requirements Document (PRD)

> **เอกสารนี้คือภาพรวมระดับสูงของโปรเจกต์ AdsLab**
> สำหรับรายละเอียดเชิงเทคนิคและแผนงานเฉพาะ feature ดูใน [openspec/](openspec/)
> สำหรับกฎการเขียนโค้ดและ convention ดูใน [CLAUDE.md](CLAUDE.md)

**Version:** 0.1 (Draft)
**Last updated:** 2026-05-11
**Founder:** คุณอินดี้

---

## 1. Executive Summary

**AdsLab** คือ Thai-first SaaS Platform + Course สำหรับ media buyer และ digital agency ในประเทศไทย

**One-liner:** "จัดการ Ads หลายแพลตฟอร์มในที่เดียว ให้ AI optimize ให้ทุกวัน อ่านตัวเลขที่มนุษย์ไม่เข้าใจให้คุณ"

**ทำไมต้องมี:** Media buyer ไทยที่จัดการบัญชีหลายร้อยบัญชี (เช่น founder เองดูแล 31 Meta accounts ใน 1 BM) ต้องสลับแพลตฟอร์ม + อ่านตัวเลขซ้ำๆ ทุกวัน — เสียเวลาและพลาดโอกาส optimize

---

## 2. Problem & Opportunity

### Pain Points ที่แก้
1. **สลับ tab/แพลตฟอร์ม** ทั้งวัน — Meta, Google, TikTok, LINE
2. **อ่านตัวเลขเอง** — CPM, CPR, CPV, ROAS, frequency — ใช้สมองเยอะ
3. **ตัดสินใจช้า** — ต้อง export → Excel → คิด → กลับมาแก้ → ส่ง report
4. **Scale ยาก** — เพิ่มลูกค้า = เพิ่มงาน manual แบบเชิงเส้น

### โอกาส
- ตลาด media buyer ไทยใหญ่และเติบโต
- เครื่องมือฝรั่ง (e.g. Madgicx, Revealbot) แพง + ไม่รองรับภาษาไทย + UX ไม่เหมาะคนไทย
- AI (Claude) ทำให้สามารถสร้าง insight + ตัดสินใจอัตโนมัติได้ในต้นทุนต่ำ
- Open-source MCP server (เช่น `meta-ads-mcp`) ลดเวลาพัฒนาได้มหาศาล

---

## 3. Target Users

### ลำดับความสำคัญ
1. **Agency operators** (primary — เหมือน founder)
   - Pain: บริหารหลายบัญชี, ต้องส่ง report ให้ลูกค้า
2. **Freelance media buyers**
   - Pain: ทำงานคนเดียว, ต้อง scale ตัวเอง
3. **SME / brand owners**
   - Pain: อยากยิงแอดเองแต่ไม่เข้าใจตัวเลข
4. **Beginners**
   - Pain: ไม่รู้จะเริ่มยังไง — Course นำเข้ามาสู่ SaaS

---

## 4. Product Vision

**3 ปีข้างหน้า:** AdsLab = "Slack/Notion ของ media buyer ไทย" — ทุก agency ในประเทศใช้

**Core Promise:**
- **เร็ว** — operations ที่เคยใช้เวลา 1 ชม. → 5 นาที
- **แม่น** — AI หา insight ที่มนุษย์มองไม่เห็น
- **Scale** — 1 คนดูแลได้ 100+ บัญชี

---

## 5. Feature Roadmap (Phase-by-Phase)

> 🎯 **กฎเหล็ก:** ห้ามทำ Phase ต่อไปจนกว่า Phase ปัจจุบันจะ ship + founder dogfood แล้ว

### 🥇 Phase 1 — MVP (4-8 สัปดาห์, **กำลังทำอยู่**)
**เป้าหมาย:** Founder ใช้แทน workflow Meta ปัจจุบันได้ทุกวัน

- [ ] Login / Signup + Email verification + Multi-tenant พื้นฐาน
- [ ] Meta OAuth + Connect ad accounts (ผ่าน Pipeboard MCP)
- [ ] Multi ad-account unified dashboard (Meta only)
- [ ] KPI Tracker (red/yellow/green pacing)
- [ ] AI Daily Report (Claude-powered, ภาษาไทย)
- [ ] AI Daily Optimization Recommendation
- [ ] AI in-app chat (Q&A เรื่องแคมเปญ)
- [ ] Basic billing (Omise + 30-day trial)

**Success metric:** Founder สามารถเลิกใช้ Meta Ads Manager ใน 70% ของ daily workflow

---

### 🥈 Phase 2 — Expand (2-3 เดือนหลัง MVP ship)
**เป้าหมาย:** Agency อื่น 5-10 รายใช้จ่ายเงิน

**Cross-platform:**
- [ ] Google Ads integration
- [ ] TikTok Ads integration
- [ ] LINE Ads integration

**Campaign Management:**
- [ ] Cross-platform campaign creation
- [ ] KPI per campaign (Reach/View/Engagement/Lead/Sale)
- [ ] Campaign template (save & reuse)
- [ ] AI ad copy generation (TH + EN)
- [ ] AI audience suggestion
- [ ] AI budget allocation

**Optimization:**
- [ ] Auto-rule (เช่น CPR > X → pause)
- [ ] Auto-shift budget across ad sets
- [ ] Alert system (near KPI / over pace / under pace)
- [ ] Frequency cap + Ad fatigue alert
- [ ] A/B test setup + report

**Reporting:**
- [ ] White-label report (client logo)
- [ ] Schedule send (daily/weekly/monthly)
- [ ] Export Excel / PPT / PDF
- [ ] Shareable link (no login)

**CRM:**
- [ ] Client database
- [ ] Client Portal (client login → see own report)

---

### 🥉 Phase 3 — Scale (3-6 เดือนหลัง Phase 2)
**เป้าหมาย:** 50-100 paying agencies + เปิด course

**Advanced AI:**
- [ ] AI predict CPM / CPR / CPV pre-launch
- [ ] AI pick organic post worth boosting
- [ ] AI generate creative brief (image/video)
- [ ] AI smart-crop creative
- [ ] AI auto-launch ads with suggested setting

**Course Platform:**
- [ ] Course player + Lesson / Module / Quiz
- [ ] Progress tracking + Certificate
- [ ] Live class booking + 1-on-1 mentor
- [ ] Q&A community + Cohort group chat

**Audience:**
- [ ] Save Audience + Custom Audience (CSV/CRM)
- [ ] Lookalike Audience
- [ ] Interest/Behavior search (TH-friendly)
- [ ] Audience template library

**Bulk Operations:**
- [ ] Bulk launch from Google Sheet / Excel
- [ ] Cross-account duplicate

**Compliance Helpers (Thai-specific):**
- [ ] Auto-enforce CBO + Lifetime budget
- [ ] Auto-enforce Multi-Advertiser Ads OFF
- [ ] Auto-enforce Age 20+ for TH targeting
- [ ] Smart pick video_id vs object_story_id (warn if dark post)

**CRM:**
- [ ] Quotation / Invoice (with VAT)
- [ ] Contract / KPI per client
- [ ] Approval workflow (creative)

**Creative Management:**
- [ ] Asset library (image/video)
- [ ] Tag system + Winning creative archive
- [ ] Auto-resize (1:1 / 9:16 / 4:5)

---

### 🎓 Phase 4 — Polish & Platform (ต่อเนื่อง)
**เป้าหมาย:** Ecosystem play + Enterprise-ready

**Integrations:**
- [ ] Public API + Webhooks
- [ ] Zapier / Make
- [ ] Google Sheet 2-way sync
- [ ] Notion / Airtable
- [ ] LINE OA (report to chat)

**Notifications:**
- [ ] Email + LINE OA push + Telegram
- [ ] In-app + Daily summary push

**Billing/Subscription:**
- [ ] Subscription tiers
- [ ] Stripe (international)
- [ ] Add-on (extra ad account / user)
- [ ] Affiliate / refer-a-friend

**Security:**
- [ ] 2FA
- [ ] Activity log
- [ ] IP whitelist
- [ ] Data backup
- [ ] Granular permission (per-account, per-feature)

**Admin:**
- [ ] Super Admin dashboard
- [ ] MRR / Churn / Growth metrics
- [ ] Support ticket
- [ ] Knowledge base
- [ ] Feature flag

**Team:**
- [ ] Team / Role (Owner, Media Buyer, Viewer) — ขยายจาก MVP

---

## 6. Tech Stack

ดูรายละเอียดเต็มใน [CLAUDE.md](CLAUDE.md) — สรุป:

| Layer | เลือก | เหตุผล |
|-------|------|--------|
| Frontend | Next.js 16 (App Router) | Server components, ทำเร็ว |
| Styling | Tailwind + shadcn/ui | Productive, สวย, customizable |
| ORM | Prisma | Type-safe, migrations จัดการง่าย |
| Database | Neon (PostgreSQL) | Free tier ดี, serverless |
| File Storage | Vercel Blob | Native กับ Vercel deploy |
| AI Gateway | **OpenRouter** (1 key, 1 bill, multi-provider) | สะดวก + สลับ model ได้ |
| AI Models | Hybrid: **Claude Sonnet** (analysis) + **Gemini Flash** (chat) | ลดต้นทุน 50-70% โดยคงคุณภาพ |
| Meta Integration (MVP) | Pipeboard / meta-ads-mcp | Skip Meta App review ในช่วงแรก |
| Payments | Omise (TH) + Stripe (intl) | Omise รองรับ PromptPay |
| Email | Resend API (`onboarding@resend.dev` ใน dev → custom domain ใน Phase 2) | ไม่ต้องรอโดเมน, free 3,000/เดือน |
| Hosting | Vercel | Native กับ Next.js |

**Budget:** <$50/เดือน ใน MVP

---

## 7. Success Metrics

### Phase 1 (MVP)
- ✅ Founder ใช้ AdsLab แทน Meta Ads Manager ใน 70% ของ daily workflow
- ✅ AI Daily Report ส่งทัน 9:00 น. ทุกวัน
- ✅ Production deploy stable (uptime > 99%)
- ✅ ต้นทุนรวม < $50/เดือน

### Phase 2
- 🎯 5-10 paying agencies
- 🎯 MRR > $1,000
- 🎯 Churn < 10%

### Phase 3
- 🎯 50-100 paying agencies
- 🎯 MRR > $20,000
- 🎯 Course มี 100+ paying students

---

## 8. Risks & Mitigations

| ความเสี่ยง | ผลกระทบ | การจัดการ |
|-----------|---------|----------|
| Pipeboard MCP ล่ม / break | สูง (ระบบใช้ Meta ไม่ได้) | Phase 2 เริ่ม submit Meta App ของตัวเอง parallel |
| Solo founder burnout | สูง | กฎ Phased — ห้ามทำ Phase ต่อก่อน Phase ปัจจุบัน ship |
| Claude API cost ทะลุ | กลาง | Prompt caching เปิด default + monitor token usage |
| Neon free tier เต็ม | กลาง | Monitor + upgrade เมื่อ user > 10 paying |
| Meta API rate limit | กลาง | Implement caching layer ตั้งแต่ MVP |
| ลูกค้าไม่ยอมจ่าย | สูง | Founder dogfood + 30-day trial + เก็บ feedback ตั้งแต่ user คนแรก |

---

## 9. Current To-Do List

> รายการนี้ sync กับ [openspec/changes/](openspec/changes/) — ดูแผนละเอียดในแต่ละ change proposal

### ✅ Completed
- **`add-mvp-foundation`** (พื้นฐาน Phase 1) — 13 tasks ✓ + 22/22 E2E tested บน production
  - Production URL: **https://adslab-theta.vercel.app**
  - ดูสรุปที่ [openspec/changes/add-mvp-foundation/tasks.md](openspec/changes/add-mvp-foundation/tasks.md)

### 📋 ถัดไป (Phase 1 — รอ foundation เสร็จ)
Proposals เหล่านี้จะถูกสร้างหลัง `add-mvp-foundation` ผ่าน:

1. **`add-meta-integration`** — เชื่อม Pipeboard MCP + connect ad accounts
2. **`add-unified-dashboard`** — Dashboard widgets + KPI tracker (red/yellow/green)
3. **`add-ai-daily-report`** — AI สรุปรายงานประจำวัน (Claude + prompt caching)
4. **`add-ai-optimization`** — AI แนะนำการ optimize รายวัน
5. **`add-ai-chat`** — In-app chat ถามตอบเรื่องแคมเปญ
6. **`add-billing`** — Omise integration + 30-day trial + subscription tiers

### 🔮 Future (Phase 2+)
ดู section 5 (Roadmap) ข้างบน — ยังไม่สร้าง proposal จนกว่า Phase 1 จะ ship

---

## 10. Decisions Log (สำคัญ)

| วันที่ | เรื่อง | ตัดสินใจ |
|-------|--------|----------|
| 2026-05-11 | Approach | Phased — MVP ก่อน, ห้ามทำทุกอย่างพร้อมกัน |
| 2026-05-11 | AI Gateway | **OpenRouter** (hybrid Claude analysis + Gemini Flash chat) — superseded direct Anthropic SDK plan |
| 2026-05-11 | Deploy | **Vercel** at https://adslab-theta.vercel.app — same Neon DB for dev + prod (split when 10+ paying customers) |
| 2026-05-11 | Meta integration (MVP) | Pipeboard MCP (skip own Meta App) |
| 2026-05-11 | Multi-tenant URL | Path-based (`/t/<slug>/...`) |
| 2026-05-11 | Email verification | Phase 1 (Hostatom SMTP) |
| 2026-05-11 | Theme | Light + Dark + toggle |
| 2026-05-11 | Budget MVP | <$50/เดือน |

---

## 11. Open Questions (ยังไม่ได้ตอบ — จะถามเมื่อใกล้ทำ)

- [ ] Subscription pricing tiers (Phase 1 billing) — ตั้งกี่ tier? ราคาเท่าไหร่?
- [ ] AI Daily Report — ส่งเวลาไหน? (9:00 default หรือให้ user เลือก?)
- [ ] KPI Tracker red/yellow/green — เกณฑ์ตัดสินคืออะไร? (CPR เท่าไหร่ = red?)
- [ ] In-app chat — ใช้ Claude คุยเฉยๆ หรือต้อง tool use (เรียก Meta API)?
- [ ] Domain name — `adslab.io`? `adslab.app`? `adslab.co.th`?

---

**📌 หมายเหตุ:** เอกสารนี้เป็น living document — update เมื่อมี decision ใหม่หรือเปลี่ยน roadmap

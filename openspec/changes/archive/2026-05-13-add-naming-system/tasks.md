# Tasks: add-naming-system (Phase 6d)

## 6d.1 — Name Pattern Filter (TenantScope extension)
- [x] Schema: `TenantScope.campaignNamePatterns: Json?`
- [x] Helper: `expandCampaignPatterns(tenantId, patterns, restrictToAccountIds)`
- [x] `getEffectiveScope` unions explicit + pattern-matched
- [x] API: PUT /api/tenant-scope accepts `campaignNamePatterns`
- [x] UI: `<NamePatternSection>` inside TenantScopeCard with live preview

## 6d.2a — Naming Templates (Settings)
- [x] Schema: `NamingTemplate` model (tenantId, name, pattern, description, isDefault)
- [x] Helper lib: `src/lib/naming-template.ts` (render + regex + detect)
- [x] API: GET/POST `/api/naming-templates`
- [x] API: PATCH/DELETE `/api/naming-templates/[id]`
- [x] UI: `<NamingTemplatesCard>` in Settings → Integrations
- [x] UI: Create Template modal with placeholder chips + live preview

## 6d.2b — Campaign Builder Smart Name
- [x] UI: `<SmartNameField>` (one-click template chips, live regex check)
- [x] Integration: replace plain `<Input>` in CampaignBuilderForm
- [x] Empty-state hint when tenant has no templates

## 6d.2c — AI Analyze Existing Names
- [x] API: POST `/api/naming-templates/ai-suggest` using `aiChat` (lite mode)
- [x] Pre-process: `detectPatternsFromNames` ground the prompt
- [x] UI: AI suggest modal with one-click accept per suggestion

## Verification
- [x] Smoke test `phase-6d-smoke.ts` — 13/13 ✓
  - Pattern persistence
  - DB expansion to real campaign IDs
  - Union of explicit + matched
  - Template rendering (MM, YY, Custom placeholders)
  - templateToRegex
  - detectPatternsFromNames
  - NamingTemplate CRUD
- [x] Regression: 6a smoke 9/9 ✓, 6b smoke 11/11 ✓
- [x] `npm run build` ✓
- [x] Deployed to https://adslab-theta.vercel.app

## Out of scope (deferred)
- [ ] Browser test for SmartNameField interaction
- [ ] Per-objective template defaults
- [ ] Rename existing campaigns to follow new convention

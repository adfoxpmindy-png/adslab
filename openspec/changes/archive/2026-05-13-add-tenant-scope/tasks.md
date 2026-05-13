# Tasks: add-tenant-scope (Phase 6b)

## Step 1 — DB
- [ ] `TenantScope` model: tenantId@unique, accountIds Json?, campaignIds Json?, timestamps
- [ ] Relation on Tenant: `scope TenantScope?`
- [ ] `prisma db push` + regen

## Step 2 — Helpers
- [ ] `getTenantScope(tenantId)` → `{ accountIds, campaignIds } | null`
- [ ] `setTenantScope(tenantId, { accountIds, campaignIds })`
- [ ] `getEffectiveScope(userId, tenantId)` — merge tenant scope + user override
  - intersect arrays; null on either side ⇒ no constraint from that side
- [ ] `applyScopeFilter(scope)` → Prisma where fragments
  - { metaAccountId? : { in: ... }, metaCampaignId? : { in: ... } }

## Step 3 — API
- [ ] `GET /api/tenant-scope?tenantSlug=` → current scope (any member can read)
- [ ] `PUT /api/tenant-scope?tenantSlug=` body: { accountIds, campaignIds } — OWNER only

## Step 4 — Settings UI
- [ ] Add **Tenant Scope** section to Settings → Integrations page
- [ ] Account multi-select (re-use AccountPicker pattern)
- [ ] Campaign multi-select (loaded lazily after account selection)
- [ ] Save button with optimistic toast

## Step 5 — Apply effective scope
- [ ] Replace `getSelectedAccountIds` callers with `getEffectiveScope`
- [ ] Dashboard payload filter: also drop campaigns not in scope (when applicable)
- [ ] Campaigns page: filter `metaCampaign` query by campaignIds when set
- [ ] Reports page: campaigns dropdown filtered to scope

## Step 6 — Test
- [x] Smoke test: scope set + merge with user override + Prisma filter
- [x] Browser test: settings page renders + save persists + dashboard reflects
- [x] Build + deploy

## Step 7 — Audit: apply scope to remaining surfaces (Phase 6c follow-up)

After initial deploy, audit found 5 places still using "all accounts"
that should respect the effective scope for consistency.

### 7.1 — AI Daily Report (cron) — highest impact
- [x] When generating tenant-wide report (`scopeId=null`), fall back to
      TenantScope.accountIds / campaignIds as the implicit filter
- [x] If tenant has no TenantScope row, behavior unchanged (= all data)
- [x] Document the precedence: explicit ReportScope > TenantScope > all

### 7.2 — Campaign Builder accounts dropdown
- [x] `/campaigns/new` page — fetch `getTenantScope` (not effective —
      builder is OWNER/MEDIA_BUYER, not personal view) and filter
      `adAccounts` list by tenant scope
- [ ] Show banner if scope is empty: "ไม่มี ad account ใน scope" (deferred — minor UX nicety)

### 7.3 — `/api/audiences` REST endpoint
- [x] Apply effective scope to the per-account fan-out loop
- [x] Returned `accounts` array respects scope

### 7.4 — `/campaigns/history` page
- [x] Filter `campaignActionLog` by campaign ids in scope (when scope set)
- [x] Hide actions on out-of-scope campaigns

### 7.5 — `/goals` page
- [x] Filter `metaCampaign.findMany` by scope before resolver
- [x] Goal totals reflect scoped data

## Step 8 — Verification
- [x] Smoke test covers all 5 surfaces post-fix (phase-6c-smoke.ts 7/7 ✓)
- [x] Deploy + spot-check on prod

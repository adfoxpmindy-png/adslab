# Tasks: add-multi-platform-ux (Phase 6a)

## Step 1 — DB models
- [ ] `UserAccountPreference` (userId, tenantId, selectedAccountIds Json, updatedAt) — composite unique (userId, tenantId)
- [ ] `PlatformWaitlist` (id, email, platform, tenantId?, userId?, createdAt) — index by email+platform
- [ ] `prisma db push` + regen

## Step 2 — Server helpers + API
- [ ] `getUserSelectedAccountIds(userId, tenantId)` → string[] or null (= all accounts)
- [ ] `setUserSelectedAccountIds(userId, tenantId, ids[])`
- [ ] `GET /api/account-preference?tenantSlug=` → { selectedAccountIds }
- [ ] `PUT /api/account-preference?tenantSlug=` body: { ids[] | null }
- [ ] `POST /api/platform-waitlist?tenantSlug=` body: { email, platform }

## Step 3 — UI components
- [ ] `<PlatformSwitcher />` — 3 tabs, Meta active, Google/TikTok link to /g/* /tt/*
- [ ] `<AccountPicker />` — chip button + dropdown panel with checkboxes
- [ ] `<TopBar />` — combines both, sticky at top
- [ ] AccountPickerContext or query-param strategy for sharing selection across components

## Step 4 — Layout integration
- [ ] Inject `<TopBar />` into authenticated layout (above content, below header)
- [ ] Default state: all accounts selected on first load (persist on first interaction)
- [ ] Empty state: "no accounts selected" → show CTA "Select accounts"

## Step 5 — Apply filter to data pages
- [ ] Dashboard — `prisma.metaAdAccount.findMany` adds `{ metaAccountId: { in: selectedIds } }`
- [ ] Reports — same
- [ ] Campaigns — filter campaigns by selected accounts
- [ ] Audiences (page + tabs) — pass selectedIds to client; filter fetches
- [ ] Events tab — same
- [ ] AI report scope (defer per-account for now — just respect tenant default)

## Step 6 — Settings → Integrations
- [ ] Refactor to 3 cards layout
- [ ] Meta card — existing connect/status (keep current)
- [ ] Google card — "Coming Soon" + waitlist form (email input + submit)
- [ ] TikTok card — same as Google
- [ ] Waitlist submit → POST `/api/platform-waitlist` → toast confirmation

## Step 7 — Coming Soon routes
- [ ] `/t/[slug]/g/page.tsx` — Google coming soon (use same component as Settings card)
- [ ] `/t/[slug]/tt/page.tsx` — TikTok coming soon
- [ ] Side-nav greys out Google/TikTok (or shows "Soon" badge)
- [ ] Optional: catch-all `/t/[slug]/g/[[...rest]]` to handle deep links

## Step 8 — Test + deploy
- [ ] Smoke test: create user prefs, deselect 1 account, verify page filter works
- [ ] Smoke test: waitlist submission persists
- [ ] Build + deploy + verify on prod

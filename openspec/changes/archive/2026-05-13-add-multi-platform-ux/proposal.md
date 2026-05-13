# Phase 6a — Multi-Platform UX Scaffolding

## Why

Current UI is implicitly Meta-only — every page queries `metaAccount*` /
`metaCampaign*` directly. Google Ads + TikTok Ads are on the roadmap but
the UI shows no place for them, and 31 ad accounts are always all-on with
no per-user filtering.

User feedback: "ไม่มีให้เลือกอะไรเลย ว่าจะใช้ Ads Account ไหน ไม่ใช้อันไหน
ใช้แพลตฟอร์มอะไร ทุกส่วนของเว็บไซต์เลย"

Building "Coming Soon" stubs for Google + TikTok now (without backend) lets
us:
1. Sell the multi-platform vision visually
2. Collect waitlist signal (email) to gauge demand before building
3. Define the URL space `/g/[slug]`, `/tt/[slug]` for future migration
4. Force the UI to think about platform context everywhere

Plus per-user account selection (chips) so a team member can focus on a
subset without affecting teammates.

## What Changes

### New: Platform Switcher (top bar)
- Sticky bar at top of every authenticated page
- 3 tabs: `[Meta active]` `[Google ⏳ Coming Soon]` `[TikTok ⏳ Coming Soon]`
- Currently active platform highlighted
- Clicking Google/TikTok → coming-soon page with waitlist form

### New: Account Picker (top bar, next to switcher)
- Chip-style button: "แสดง X/Y accounts ▼"
- Click → dropdown with checkbox list of accounts
- "Select all" / "Select none" shortcuts
- Per-user preference, persisted to DB
- All data queries respect this preference

### New: Coming Soon routes
- `GET /t/[slug]/g/*` → Google Ads coming soon page
- `GET /t/[slug]/tt/*` → TikTok coming soon page
- Waitlist form: email + "interested in [Google/TikTok]"
- Confirmation toast: "We'll email you when ready"

### Changed: Settings → Integrations
- Was: only Meta connect/disconnect
- Now: 3 platform cards
  - **Meta** — connect / status / disconnect (existing)
  - **Google Ads** — "Coming Soon" + waitlist signup
  - **TikTok Ads** — "Coming Soon" + waitlist signup

### Changed: All data pages respect account filter
- Dashboard — only show selected accounts
- Reports — only generate for selected accounts
- Campaigns — only list campaigns from selected accounts
- Audiences — filter audiences/pixels/conversions/events to selected accounts
- AI report — scope to selected accounts

### Database
- `UserAccountPreference` (userId, tenantId, selectedAccountIds JSON, updatedAt)
- `PlatformWaitlist` (id, email, platform, tenantId?, userId?, createdAt)

## Impact

**Affected pages (read account preference):**
- `/dashboard`, `/reports`, `/reports/[id]`, `/campaigns`, `/campaigns/history`,
  `/audiences`, `/events`

**Affected APIs (filter by selected accounts):**
- `/api/audiences`, `/api/meta/audiences`, `/api/meta/pixels`,
  `/api/meta/custom-conversions`, `/api/meta/insights`, `/api/meta/insights/refresh`,
  `/api/reports/*`

**Settings page** — refactor to 3-card layout
**Root layout** — inject `<TopBar />` above main content (authenticated pages only)

**Out of scope (Phase 6b future):**
- Actual Google Ads / TikTok API integration
- Migrating `MetaAdAccount` → generic `AdAccount` with platform field
- Account-level granularity for AI report generation (per-account scopes)

## Risks

1. **Empty-state bug** — if user deselects all accounts, every page shows
   "no data" — need clear empty state with "select accounts" CTA
2. **First-time UX** — new user has 0 saved preferences → default to all
   selected, persist on first interaction
3. **Waitlist abuse** — email collection without verification → rate-limit
   by IP, no auth required
4. **Filter perf** — adding a Prisma `where` clause everywhere is cheap,
   but cache keys need to include selectedAccountIds → invalidate properly

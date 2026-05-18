## PR 1 — Foundation (~2 days)

### 1. Library + tooling

- [x] 1.1 `npm install next-intl` — confirm bundle impact.
- [x] 1.2 Create `messages/th.json`, `messages/en.json`, `messages/lo.json` skeletons with namespace stubs (`sidebar`, `topbar`, `common`, `reports`, `ai`, `posts`, `settings`).
- [x] 1.3 Create `src/lib/i18n/index.ts` exporting `t()` for server (`getTranslations`) + `useT()` for client (`useTranslations`).
- [x] 1.4 Create `src/lib/i18n/format.ts` with `formatDateTime(date, locale)` + `formatCurrency(amount, locale, currency)` helpers.

### 2. Middleware + cookie

- [x] 2.1 Create or extend `src/middleware.ts` to resolve locale from cookie → Accept-Language → default `"th"`. Pass the resolved locale to `next-intl`'s request config.
- [x] 2.2 Configure `next-intl` request handler to expose the locale to RSC.
- [x] 2.3 Auth login route sets `adslab-locale` cookie based on `User.preferredLocale`.

### 3. Schema + user preference

- [x] 3.1 Add `preferredLocale String @default("th")` to `User` model.
- [x] 3.2 `prisma db push` to apply (no destructive migration).
- [x] 3.3 Update login flow + session helpers to read/write the column.

### 4. Language switcher UI

- [x] 4.1 Build `<LanguageSwitcher />` client component (3 options, current marked, on-click POSTs to `/api/user/locale` + rewrites cookie + `router.refresh()`).
- [x] 4.2 Add it to the sidebar profile DropdownMenu (between ตั้งค่า and ออกจากระบบ).
- [x] 4.3 New `POST /api/user/locale` route — body `{ locale: "th" | "en" | "lo" }` → updates `User.preferredLocale` + sets cookie + returns 200.

### 5. AI prompt locale plumbing

- [x] 5.1 Add `resolveUserLocale(userId): Promise<Locale>` helper.
- [x] 5.2 Update Daily Report prompt builder to take `locale` and inject the locale-directive sentence (see design.md D4).
- [x] 5.3 Update Chat `SYSTEM_PROMPT_BASE` builder to inject locale dynamically (currently hardcoded "Reply in Thai by default").
- [x] 5.4 Update `VISION_SYSTEM_PROMPT` in `analyze-ad-creative.ts` to take a locale (current Thai-only hardcode → templated).
- [x] 5.5 Update knowledge synthesis chunk-renderer to instruct output in the user's locale.

### 6. Shared component migration (high-traffic first)

- [x] 6.1 Migrate `SIDEBAR_NAV_ITEMS` labels to `t("sidebar.nav.<key>")`.
- [ ] 6.2 Migrate `SetPageTitle` `title`/`subtitle` usages — top 10 pages, use `t()`.
- [ ] 6.3 Common button labels (Save / Cancel / Confirm) → `t("common.<key>")`.
- [ ] 6.4 Status badges across the codebase.

### 7. Ship + verify

- [x] 7.1 Translate Thai source → English using Claude (one-shot per ~50 keys).
- [x] 7.2 Skip Lao for PR 1 — keep `lo.json` as a copy of `th.json` for fallback safety; mark with `// TODO: Lao translation`.
- [x] 7.3 Type-check + lint clean.
- [ ] 7.4 Manual smoke: switch each of 3 locales, browse 5 pages, verify no missing-key crashes.
- [x] 7.5 Commit + push + archive PR 1.

## PR 2 — Page coverage + Lao (~2-3 days)

### 8. Lao dictionary

- [ ] 8.1 Generate Lao translations via Claude for all keys currently in `th.json`. Provide Thai + English context in the prompt.
- [ ] 8.2 Mark each Lao value with confidence comment if uncertain.
- [ ] 8.3 Update `lo.json` and remove the Thai-fallback placeholders.

### 9. Page-by-page migration (priority order)

- [ ] 9.1 Dashboard (`/t/[slug]/dashboard`).
- [ ] 9.2 Campaigns (`/t/[slug]/campaigns`) — table headers, status pills, action menu.
- [ ] 9.3 Reports (`/t/[slug]/reports` + `/reports/[date]`).
- [ ] 9.4 Ads (`/t/[slug]/ads`) — vision button, panel.
- [ ] 9.5 AI Memory (`/t/[slug]/ai/memory`).
- [ ] 9.6 Posts (`/t/[slug]/posts` + `/posts/new`).
- [ ] 9.7 Audiences + Creatives.
- [ ] 9.8 Settings (Integrations + Scope + Naming).

### 10. Formatter cleanup

- [ ] 10.1 Grep for `toLocaleString("th-TH"` — replace with `formatDateTime` / `formatCurrency` helpers.
- [ ] 10.2 Grep for hardcoded `"พ.ค."` / `"พ.ศ."` style month names — replace with helpers.

### 11. CI keyset diff warning

- [ ] 11.1 Add `scripts/i18n-diff-keys.ts` — compares th.json key set to en.json / lo.json; prints yellow warnings for missing keys.
- [ ] 11.2 Run in GitHub Actions on every PR.

### 12. Ship + archive PR 2

- [ ] 12.1 Commit + push + archive PR 2.
- [ ] 12.2 Add in-app feedback widget on language switcher: "พบคำแปลที่ไม่ดี? บอกเราใน chat support" (or DM founder).

## Out of scope (do NOT include)

- 13.1 URL-prefixed locale routing (`/en/...`).
- 13.2 RTL language support.
- 13.3 Translating user-supplied content (captions, campaign names).
- 13.4 Per-tenant locale overrides.
- 13.5 Native-speaker Lao QA pass (separate after-launch task).
- 13.6 Re-translating the existing Nick Theriot knowledge-base English transcripts.

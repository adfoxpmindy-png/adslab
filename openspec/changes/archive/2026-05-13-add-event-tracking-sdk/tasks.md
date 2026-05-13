# Tasks: add-event-tracking-sdk (Phase 5)

Phase 5 = ของระดับ PixelYourSite — hosted SDK + CAPI relay + rule builder.
Scope ใหญ่ แบ่งเป็น 5a–5e ทำตามลำดับ เผื่อจะ ship เร็วๆ ระหว่างทาง

---

## Phase 5a — Foundation (Schema + Auth + SDK Skeleton)

### Task 5a.1 — Schema: EventRule + EventLog + CapiAccessToken
- [ ] Model `EventRule` (tenantId, name, pixelId, triggerType, conditions JSON, eventName, paramsExtractor JSON, enabled)
- [ ] Model `EventLog` (tenantId, ruleId, firedAt, eventName, payload, dedupKey, capiStatus, capiResponse)
- [ ] Model `CapiAccessToken` per tenant (encrypted, scope, expiresAt)
- [ ] Indexes: tenantId+enabled (rule), tenantId+firedAt (log)
- [ ] `prisma db push` + regenerate

### Task 5a.2 — CAPI Access Token: get + refresh
- [ ] Investigate: can existing user token power CAPI? (test `/<pixel_id>/events`)
- [ ] If no: generate System User token via Business Manager API
- [ ] Encrypted storage (re-use existing encrypt helper)
- [ ] Refresh logic

### Task 5a.3 — SDK Skeleton (public/adslab-pixel.js)
- [ ] Bundle config: TS source → ES5 IIFE bundle (~10KB target)
- [ ] On load: fetch config from `/api/event-sdk/config/<siteKey>`
- [ ] Inject Meta Pixel base code if missing
- [ ] Fire PageView on init
- [ ] Set up MutationObserver + listeners for triggers

### Task 5a.4 — `/api/event-sdk/config/[siteKey]/route.ts`
- [ ] Public endpoint, no auth (siteKey = signed token tied to tenant)
- [ ] Return JSON of enabled rules + pixel_id
- [ ] Cache 5 min, invalidate when rules updated
- [ ] Rate limit (per IP)

---

## Phase 5b — Trigger Engine + CAPI Relay

### Task 5b.1 — SDK Trigger Types
- [ ] URL pattern (regex / contains / equals / path matches)
- [ ] CSS selector click (single + delegated)
- [ ] Form submit (with field extraction)
- [ ] Scroll percentage threshold
- [ ] Time on page threshold
- [ ] Custom JS event (`window.dispatchEvent`)

### Task 5b.2 — Dynamic Param Extractors
- [ ] `data-*` attribute selector (e.g., `data-price="299"` → `value: 299`)
- [ ] Text content selector (CSS path → number/string)
- [ ] Form field by name
- [ ] URL query param
- [ ] Currency auto-detect (lookup symbol in selector text)

### Task 5b.3 — CAPI Relay Endpoint
- [ ] `POST /api/event-sdk/capi` body: { siteKey, eventName, eventId, params, userAgent, fbp, fbc, email?, phone? }
- [ ] Resolve tenant + pixel from siteKey
- [ ] Hash PII (sha256 lowercase trim, phone normalize +66)
- [ ] Build CAPI payload (test_event_code in dev)
- [ ] Send to `/<pixel_id>/events`
- [ ] Persist EventLog row
- [ ] Return 204 quickly (don't block SDK)

### Task 5b.4 — Dedup with Pixel
- [ ] SDK generates eventId per fire
- [ ] Browser fires Pixel with `eventID: <id>`
- [ ] CAPI sends with `event_id: <id>` matching
- [ ] Meta dedups within ~48h

---

## Phase 5c — Rule Builder UI

### Task 5c.1 — Tab "Events" in /audiences
- [ ] Add 4th tab (Audiences | Pixels | Conversions | Events)
- [ ] List of EventRules with status badge + last-fired indicator
- [ ] Filter by pixel + by enabled

### Task 5c.2 — Rule Create / Edit Modal
- [ ] Step 1: pick Event name (standard Meta event)
- [ ] Step 2: pick trigger type → form fields adapt
- [ ] Step 3: pick params extractors (optional)
- [ ] Test pane: paste a URL, see if rule would fire

### Task 5c.3 — Presets Library
- [ ] WooCommerce: AddToCart on .add_to_cart_button, Purchase on /thank-you
- [ ] Shopify: AddToCart on `form[action="/cart/add"]`, Purchase on /orders
- [ ] Generic Landing Page: Lead on form submit, ViewContent on PageView

### Task 5c.4 — SDK Install Code Modal
- [ ] Show install snippet with siteKey baked in
- [ ] Verify install: ping endpoint that confirms SDK loaded on user's domain
- [ ] Status: ✓ installed (last seen 5min ago) / ⚠ not detected

---

## Phase 5d — Event Log + Debug

### Task 5d.1 — Realtime event log page
- [ ] `/t/<slug>/events/log` page
- [ ] List EventLog rows reverse-chrono
- [ ] Filter: tenant, pixel, event name, time range, status
- [ ] Auto-refresh every 5s

### Task 5d.2 — Event detail drawer
- [ ] Click row → drawer with full payload
- [ ] Show: rule that fired, dedup key, CAPI response, raw browser context
- [ ] "Resend to Meta" button (for debugging)

### Task 5d.3 — Health summary widget
- [ ] Add to dashboard
- [ ] "Last 24h: X events fired, Y dedup'd, Z CAPI errors"

---

## Phase 5e — Integration + Polish

### Task 5e.1 — Wire to Campaign Builder
- [ ] EventRule.eventName feeds into the standard event picker (alongside Custom Conversions)
- [ ] When user picks event → suggest using it as conversion goal

### Task 5e.2 — Onboarding wizard update
- [ ] After Pixel creation → step "ติด SDK บนเว็บ" (instead of just Meta Pixel code)
- [ ] After SDK install → step "ตั้ง 1 rule (Purchase)"

### Task 5e.3 — Privacy policy update
- [ ] Page `/privacy` mentions: server-side CAPI processing, PII hashing
- [ ] Cookie banner stub (defer GDPR proper)

### Task 5e.4 — Smoke test + deploy
- [ ] Self-test on adslab landing
- [ ] Verify Meta Events Manager receives test events
- [ ] `npm run build` + `vercel --prod`

# Phase 9 — Billing & Subscriptions (Omise)

## Why

AdsLab has shipped 8 phases of features (dashboard, AI Master, audiences,
custom conversions, Event SDK, Customer Journey…) but has **zero
revenue mechanism**. We're burning ~฿2,000/mo of AI + infra cost per
~50 dogfood users, and as soon as friends/early adopters sign up the
cost will compound. We need to monetize **before** opening signups
beyond closed beta.

**Pricing model** (decided after market research — see commit message):

| Tier | Ad spend/mo | Price/mo | Yearly (-17%) | Ad accounts | AI msg/day |
|---|---|---|---|---|---|
| Starter | < ฿10k | ฿1,490 | ฿14,990 | 1 | 30 |
| Growth | > ฿30k | ฿3,890 | ฿38,990 | 3 | 100 |
| Pro | > ฿100k | ฿10,990 | ฿109,990 | 10 | 300 |
| Scale | > ฿500k | ฿44,990 | ฿449,990 | 25 | Unlimited |
| Enterprise | > ฿1M | Contact | — | Unlimited | Unlimited |

Pricing logic: effective % of ad spend at tier ceiling
(15 / 13 / 11 / 9 %). All prices end in 90 / 990 (Thai retail convention).

**Add-ons** (extra monthly charge):
- Event SDK + Pixel Tracking — ฿590/mo (Phase 5 SDK becomes paid)
- Extra Ad Account — ฿190/account/mo (beyond tier limit)
- White-label Reports — ฿490/mo (free for Scale+)
- Priority AI (Claude Opus) — ฿890/mo (default is Sonnet)
- Extra AI msg (Starter/Growth/Pro) — ฿0.50/msg (over daily cap)

**Trial** — 7 days, **card required upfront** (different from Madgicx
who lets users skip card; we prevent trial abuse and lift post-trial
conversion). Reminders day 5 + day 6 + day 7. Auto-charge day 8.

**Payment gateway** — Omise (Thai-native, supports THB, recurring,
3.65% + ฿10/transaction). Already stubbed in `.env.local.example`
lines 59-62.

## What Changes

### 9.1 — Data model (Prisma)

New models:
- `Plan` — catalog row per tier (Starter/Growth/Pro/Scale + add-ons)
- `TenantSubscription` — current subscription state per tenant
  (planId, status, trialEndsAt, currentPeriodEnd, omiseCustomerId,
  omiseCardId, billingInterval: MONTHLY|YEARLY, addOns: Json)
- `Invoice` — every successful or failed charge attempt
  (omiseChargeId, amount, status, billingPeriodStart/End, paidAt,
  failureReason, receiptUrl)
- `UsageMetric` — per-tenant per-day rollup
  (date, aiMessagesCount, aiInputTokens, aiOutputTokens, adSpendThb)
- `BillingEvent` — immutable audit log of every state transition
  (kind: TRIAL_STARTED / CHARGE_SUCCESS / CHARGE_FAILED / CANCELLED /
  UPGRADED / DOWNGRADED / REFUNDED, payload: Json)

Migration is additive — no existing data touched.

### 9.2 — Omise integration (`src/lib/billing/omise/`)

- `client.ts` — Omise SDK singleton
- `customer.ts` — create/update Omise customer per tenant
- `charge.ts` — create charge, handle 3DS, mark Invoice
- `webhook.ts` — handle `charge.complete`, `charge.failed`,
  `customer.create`, `dispute.create` events
- `refund.ts` — pro-rated refund in 7-day grace window
- API routes:
  - `POST /api/billing/checkout` — start subscription (returns
    Omise checkout URL or 3DS redirect)
  - `POST /api/billing/webhook` — Omise webhook receiver (idempotent)
  - `POST /api/billing/cancel`
  - `POST /api/billing/upgrade`
  - `POST /api/billing/add-addon`
  - `GET /api/billing/invoices`

### 9.3 — Trial lifecycle (cron)

New cron `/api/cron/billing-tick` daily at 03:00 UTC (10:00 BKK):
- For every active subscription:
  - If today = `trialEndsAt - 2d` → send email "เหลือ 2 วัน" + in-app banner
  - If today = `trialEndsAt - 1d` → send email "พรุ่งนี้เริ่มเก็บเงิน"
  - If today = `trialEndsAt` → send email "เริ่มเก็บเงินใน 24 ชม."
  - If today = `trialEndsAt + 1d` → call Omise charge → record Invoice
  - If charge failed → grace 3 days, then suspend tenant
  - If status = ACTIVE and today = `currentPeriodEnd + 1d` →
    recurring charge

### 9.4 — Feature gating

New `src/lib/billing/gate.ts` with single function:

```
requireFeature(tenantId, feature: FeatureKey): Promise<void>
  // FeatureKey =
  //   "ai-chat" | "ai-chat-msg" (per-day count)
  //   "ad-account-count" (current count)
  //   "event-sdk" (add-on)
  //   "white-label" (add-on)
  //   "priority-ai" (add-on)
```

Throws `FeatureGateError` with reason: TIER_LIMIT | ADDON_REQUIRED |
TRIAL_EXPIRED | SUSPENDED. Caller translates to UI/API response.

Insertion points:
- AI chat send → check `ai-chat-msg`
- Add Meta account → check `ad-account-count`
- Event SDK install code endpoint + CAPI relay → check `event-sdk`
- Report download → check `white-label` (toggle branding)

### 9.5 — Ad-spend tracker

Background job (in same `billing-tick` cron):
- For every tenant, sum Meta `account_insights.spend` for last 30 days
- Update `UsageMetric.adSpendThb` (rollup for current day)
- If 30-day avg crosses next tier threshold for ≥14 days →
  flag `subscription.tierUpgradeRecommended = true`
- Dashboard banner reads this flag and prompts upgrade

### 9.6 — UI

- `/t/<slug>/settings/billing/page.tsx` — main billing page:
  current plan card + invoice list + add-on toggles +
  cancel/upgrade buttons
- `/t/<slug>/settings/billing/checkout/page.tsx` — Omise checkout
  embed (or redirect target after Omise 3DS)
- `/t/<slug>/signup-payment/page.tsx` — required step after email
  verify but before entering app
- `TierLimitBanner` in tenant layout — shows when:
  - trial expires in ≤ 2 days, OR
  - subscription failed last charge, OR
  - ad spend crossed tier threshold, OR
  - any add-on usage > 90% of cap
- Enable Settings → Billing tab (currently disabled in layout.tsx:25)

### 9.7 — Email templates

- `trial-reminder-2d.ts` / `trial-reminder-1d.ts` / `trial-final.ts`
- `invoice-paid.ts` (receipt with VAT info per Thai law)
- `invoice-failed.ts`
- `subscription-cancelled.ts`
- `tier-upgrade-recommended.ts`

All Thai-language, brand-consistent with existing templates.

### 9.8 — Convert Event SDK to add-on

- `EventRule` + `EventLog` + CAPI relay endpoints all check
  `requireFeature("event-sdk")` before processing
- If add-on not active, install-code endpoint returns 402 with Thai
  message + link to upgrade
- Existing rules don't fire (graceful) — preserved for re-enable

## Impact

**New files** (~25):
- `prisma/schema.prisma` — +5 models
- `src/lib/billing/{omise,gate,tier-rules,addon}.ts`
- `src/lib/billing/omise/{client,customer,charge,webhook,refund}.ts`
- `src/app/api/billing/{checkout,webhook,cancel,upgrade,add-addon,invoices}/route.ts`
- `src/app/api/cron/billing-tick/route.ts`
- `src/app/t/[tenantSlug]/settings/billing/page.tsx`
- `src/app/t/[tenantSlug]/settings/billing/checkout/page.tsx`
- `src/app/t/[tenantSlug]/signup-payment/page.tsx`
- `src/components/tenant/tier-limit-banner.tsx`
- `src/lib/email/templates/{trial-reminder-2d,trial-reminder-1d,trial-final,invoice-paid,invoice-failed,subscription-cancelled,tier-upgrade-recommended}.ts`
- `prisma/seed/plans.ts` (idempotent seeder)

**New deps**:
- `omise` (~50KB) — official Omise Node SDK
- `dayjs` (already installed) — date math for billing periods

**Modified**:
- `prisma/schema.prisma` — Tenant gets `subscription` relation
- `src/app/t/[tenantSlug]/settings/layout.tsx` — enable Billing tab
- `src/app/t/[tenantSlug]/layout.tsx` — mount `<TierLimitBanner />`
- `src/app/api/event-sdk/**/*.ts` — gate by `event-sdk` add-on
- `src/app/api/ai/chat/route.ts` — gate by `ai-chat-msg` quota
- `src/app/api/meta/accounts/route.ts` — gate by `ad-account-count`
- `src/lib/auth/post-verify.ts` (new) — redirect to signup-payment
  page after email verify, before letting user into `/t/...`
- `vercel.json` — add billing-tick cron
- `.env.local.example` — uncomment OMISE keys + add OMISE_WEBHOOK_SECRET

## Risks

1. **Trial abuse via card not honored** — Omise validates card on
   `customer.create` but a card can still bounce on actual charge.
   Mitigation: 3-day grace period + email + suspend (not delete).
2. **Webhook idempotency** — Omise can retry; we keep
   `processedOmiseEventIds` set per tenant subscription to dedupe.
3. **Race condition** — Charge succeeds but webhook hasn't arrived
   yet. Mitigation: client-side checkout returns Omise charge ID;
   we poll once for status before showing success page.
4. **Tier downgrade with active add-ons** — User on Pro
   has white-label add-on, downgrades to Starter. We keep add-on
   active (separately billed), just enforce base plan limits.
5. **Refund math** — Pro-rated for unused days within 7-day grace.
   `daysUsed = (now - currentPeriodStart) / 1 day`,
   `refund = price × (daysInPeriod - daysUsed) / daysInPeriod`.
6. **Currency** — All charges in THB. Omise supports it natively.
   No multi-currency in v1.
7. **VAT** — Thai law requires 7% VAT on B2C SaaS. Prices stated
   ARE inclusive of VAT (display strategy). Invoice shows the split.

## Out of Scope (defer to Phase 9.5+)

- Self-serve upgrade from Starter to Enterprise (Enterprise = sales call)
- Promotional codes / discount coupons (admin will create one-off
  Omise discounts manually if needed)
- Team billing (one card paying for multiple tenants)
- Crypto / PromptPay QR payment (Omise supports but UX differs)
- Annual-to-monthly proration on downgrade (cancel-and-recreate
  in v1)
- Multi-currency display (THB-only for now)
- Tax receipt with full Thai tax ID for B2B (Phase 10 with invoicing)

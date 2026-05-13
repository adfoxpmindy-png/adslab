# Phase 9 — Billing Tasks

## 1. Schema + seed
- [ ] 1.1 Add `Plan`, `TenantSubscription`, `Invoice`, `UsageMetric`, `BillingEvent` to `prisma/schema.prisma`
- [ ] 1.2 Add enums `SubscriptionStatus`, `BillingInterval`, `InvoiceStatus`, `BillingEventKind`
- [ ] 1.3 Run `prisma migrate dev --name add-billing` against local Neon
- [ ] 1.4 Create `prisma/seed/plans.ts` — seed Starter/Growth/Pro/Scale + 4 add-ons (idempotent upsert by `key`)
- [ ] 1.5 Wire seed into `package.json` script `seed:plans`; run once locally + once on prod

## 2. Tier rules + feature gate
- [ ] 2.1 `src/lib/billing/tier-rules.ts` — pure functions: `getTierLimits(planKey)`, `pickRecommendedTier(adSpend)`, `priceForBracket(spend)`
- [ ] 2.2 `src/lib/billing/gate.ts` — `requireFeature()` + `getEffectiveSubscription()` (with cache)
- [ ] 2.3 Unit-test gate logic with table of subscription states (trial / active / past_due / cancelled / suspended)

## 3. Omise integration
- [ ] 3.1 Add `omise` package, configure `.env.local` keys (local sandbox)
- [ ] 3.2 `src/lib/billing/omise/client.ts` — singleton with secret key
- [ ] 3.3 `src/lib/billing/omise/customer.ts` — `getOrCreateOmiseCustomer(tenantId, cardToken)`
- [ ] 3.4 `src/lib/billing/omise/charge.ts` — `createCharge({ subscriptionId, amount, description })`
- [ ] 3.5 `src/lib/billing/omise/webhook.ts` — handle `charge.complete`, `charge.failed`, `dispute.create`; idempotency via `BillingEvent.idempotencyKey`
- [ ] 3.6 `src/lib/billing/omise/refund.ts` — pro-rated refund within 7-day grace

## 4. API routes
- [ ] 4.1 `POST /api/billing/checkout` — body: { planKey, interval, addOnKeys[], cardToken } → create Omise customer + first charge → return invoiceId or 3DS redirect URL
- [ ] 4.2 `POST /api/billing/webhook` — verify Omise signature, dispatch by event type
- [ ] 4.3 `POST /api/billing/cancel` — set status=CANCELLED, keep access until period end
- [ ] 4.4 `POST /api/billing/upgrade` — change plan, charge proration immediately
- [ ] 4.5 `POST /api/billing/add-addon` and `DELETE /api/billing/add-addon` — toggle add-on
- [ ] 4.6 `GET /api/billing/invoices` — paginated list for current tenant

## 5. Trial + billing cron
- [ ] 5.1 `vercel.json` — add `/api/cron/billing-tick` at `0 3 * * *`
- [ ] 5.2 `src/app/api/cron/billing-tick/route.ts` — iterate active subscriptions, run trial-reminder + charge logic per tenant
- [ ] 5.3 Email templates: trial-reminder-2d / -1d / -final, invoice-paid, invoice-failed
- [ ] 5.4 Test cron locally by invoking the route with `CRON_SECRET` header

## 6. Signup-payment flow
- [ ] 6.1 `src/lib/auth/post-verify.ts` — after email verify, if user has no `TenantSubscription` → redirect to `/t/<slug>/signup-payment`
- [ ] 6.2 `src/app/t/[tenantSlug]/signup-payment/page.tsx` — Omise.js card form, plan picker, addon checkboxes, "Start 7-day Trial" button
- [ ] 6.3 Submit → `POST /api/billing/checkout` with cardToken (no charge yet — just save card via Omise customer)
- [ ] 6.4 After save → set `trialEndsAt = now + 7d`, status = `TRIALING`, redirect to dashboard

## 7. Feature gating insertion points
- [ ] 7.1 `src/app/api/ai/chat/route.ts` — call `requireFeature(tenantId, "ai-chat-msg")` before chat-service.sendMessage
- [ ] 7.2 `src/app/api/event-sdk/install-code/[siteKey]/route.ts` — gate by `event-sdk`
- [ ] 7.3 `src/app/api/event-sdk/config/[siteKey]/route.ts` — gate by `event-sdk` (returns empty rules if not active)
- [ ] 7.4 `src/app/api/event-sdk/capi/route.ts` — gate by `event-sdk`
- [ ] 7.5 `src/app/api/meta/accounts/route.ts` — count current accounts before adding; error if > tier limit and no `extra-ad-account` add-on

## 8. UI
- [ ] 8.1 `src/app/t/[tenantSlug]/settings/layout.tsx` — enable Billing tab (remove `disabled`)
- [ ] 8.2 `src/app/t/[tenantSlug]/settings/billing/page.tsx` — current plan card, usage bars (AI msg today, ad accounts used), invoices table, add-on toggles, cancel button
- [ ] 8.3 `src/components/tenant/tier-limit-banner.tsx` — banner with 4 states (trial-expiring, payment-failed, tier-overage, addon-cap-near)
- [ ] 8.4 Mount `<TierLimitBanner />` in `src/app/t/[tenantSlug]/layout.tsx`
- [ ] 8.5 Plan picker dialog — used in signup-payment + upgrade flow (`src/components/billing/plan-picker.tsx`)

## 9. Ad-spend tracking + tier recommendation
- [ ] 9.1 In `billing-tick` cron, after charge logic: rollup 30-day ad spend per tenant
- [ ] 9.2 If avg spend crosses next tier ceiling for ≥14 days → set `subscription.tierUpgradeRecommended = true`
- [ ] 9.3 Banner reads flag; clicking opens upgrade dialog with proration preview

## 10. Test scenarios (manual + Playwright)
- [ ] 10.1 New signup → email verify → forced to signup-payment → submit Omise card token → trial active
- [ ] 10.2 Day 8 cron tick → charge → invoice created → email receipt sent
- [ ] 10.3 Failed payment → 3-day grace → suspended → email
- [ ] 10.4 Cancel during trial → access until trialEndsAt → no charge
- [ ] 10.5 Cancel mid-period → access until currentPeriodEnd → no recurring charge
- [ ] 10.6 Upgrade Starter → Growth mid-period → proration charge → effective immediately
- [ ] 10.7 Ad spend crosses ฿30k for 14 days → banner appears → click → upgrade
- [ ] 10.8 Add Event SDK add-on → install-code endpoint now returns valid JS → rules fire
- [ ] 10.9 Remove Event SDK add-on → install-code returns 402 → rules stop firing
- [ ] 10.10 Refund within 7d → Omise refund + Invoice marked REFUNDED + access ends

## 11. Deploy
- [ ] 11.1 Add `OMISE_PUBLIC_KEY` / `OMISE_SECRET_KEY` / `OMISE_WEBHOOK_SECRET` to Vercel env
- [ ] 11.2 Deploy to prod
- [ ] 11.3 Configure Omise webhook URL in dashboard: `https://adslab-theta.vercel.app/api/billing/webhook`
- [ ] 11.4 Run `seed:plans` on prod once
- [ ] 11.5 Smoke test: signup with test card → trial → manually advance trialEndsAt → cron → charge
- [ ] 11.6 Update `MEMORY.md` with phase 9 deploy entry

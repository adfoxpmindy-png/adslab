# Spec: Billing & Subscriptions

**Capability:** Tier-based SaaS subscriptions priced by Meta ad spend,
charged in THB via Omise, with a 7-day card-required trial,
feature gating, add-ons, and pro-rated refunds.

## Pricing

Five tiers + add-ons. Prices are **VAT-inclusive** (Thai law). All
prices end in 90 or 990.

| Plan key | Tier name | Spend ceiling | THB/mo | THB/yr (-17%) | Account limit | AI msg/day |
|---|---|---|---|---|---|---|
| `starter` | Starter | < ฿10k | 1,490 | 14,990 | 1 | 30 |
| `growth` | Growth | < ฿30k | 3,890 | 38,990 | 3 | 100 |
| `pro` | Pro | < ฿100k | 10,990 | 109,990 | 10 | 300 |
| `scale` | Scale | < ฿500k | 44,990 | 449,990 | 25 | Unlimited |
| `enterprise` | Enterprise | > ฿1M | (sales-led) | — | Unlimited | Unlimited |

Add-ons (charged on top of base plan):

| Add-on key | Name | THB/mo |
|---|---|---|
| `event-sdk` | Event SDK + Pixel Tracking | 590 |
| `extra-ad-account` | Extra Ad Account (per account) | 190 |
| `white-label` | White-label Reports (free for Scale+) | 490 |
| `priority-ai` | Priority AI (Claude Opus) | 890 |
| `overage-ai-msg` | Over-cap AI message (per msg) | 0.50 |

`pickRecommendedTier(adSpendThb)` returns the smallest plan whose
spend ceiling is greater than `adSpendThb`.

## Data model

```
Plan
  id, key UNIQUE, name, priceMonthly, priceYearly,
  spendCeilingThb (null = enterprise), adAccountLimit, aiMsgPerDay,
  isAddOn, active, createdAt, updatedAt

TenantSubscription (one per tenant)
  tenantId UNIQUE, planId (current base plan),
  status: SubscriptionStatus,
  interval: BillingInterval,
  trialEndsAt, currentPeriodStart, currentPeriodEnd,
  cancelAtPeriodEnd: bool, cancelledAt,
  omiseCustomerId, omiseCardId,
  addOnKeys String[], extraAdAccounts Int @default(0),
  tierUpgradeRecommended bool @default(false),
  createdAt, updatedAt

Invoice
  id, tenantId, omiseChargeId UNIQUE,
  amount, currency ('THB' const),
  status: InvoiceStatus,
  billingPeriodStart, billingPeriodEnd,
  paidAt, failureCode, failureMessage,
  receiptUrl, createdAt

UsageMetric (one row per tenant per day)
  id, tenantId, date @db.Date,
  aiMessagesCount Int, aiInputTokens BigInt, aiOutputTokens BigInt,
  adSpendThb Int,
  UNIQUE(tenantId, date)

BillingEvent (immutable audit log)
  id, tenantId, kind: BillingEventKind,
  idempotencyKey UNIQUE (for Omise webhook dedupe),
  payload Json, createdAt

enum SubscriptionStatus {
  TRIALING ACTIVE PAST_DUE SUSPENDED CANCELLED
}
enum BillingInterval { MONTHLY YEARLY }
enum InvoiceStatus  { PENDING PAID FAILED REFUNDED }
enum BillingEventKind {
  TRIAL_STARTED TRIAL_REMINDER_SENT TRIAL_CONVERTED
  CHARGE_SUCCESS CHARGE_FAILED
  UPGRADED DOWNGRADED ADDON_ADDED ADDON_REMOVED
  CANCELLED RESUMED REFUNDED SUSPENDED
}
```

## Trial flow

```
signup → email verify → /signup-payment (forced step)
  ↓ submit Omise cardToken
create Omise customer + save card (no charge yet)
  ↓ TenantSubscription { status: TRIALING, trialEndsAt: now + 7d }
redirect → /t/<slug>/dashboard
```

**Daily cron `/api/cron/billing-tick`** at 03:00 UTC iterates every
subscription:

| Day relative to `trialEndsAt` | Action |
|---|---|
| -2 | Email `trial-reminder-2d` + set banner state |
| -1 | Email `trial-reminder-1d` |
| 0 | Email `trial-final` |
| +1 | Create Omise charge → if success: status=ACTIVE, `currentPeriodEnd=now+30d` (or +1y); if fail: status=PAST_DUE |
| +4 (3 days past_due) | Suspend tenant → status=SUSPENDED, send `subscription-cancelled` email |

For ACTIVE subscriptions, on `currentPeriodEnd + 1d` the cron creates
a recurring charge with the same rules.

## Feature gates

`requireFeature(tenantId, key)` resolves the tenant's effective
subscription and throws `FeatureGateError` if blocked.

| Feature key | Allowed when |
|---|---|
| `ai-chat` | status ∈ {TRIALING, ACTIVE} |
| `ai-chat-msg` | usage today < plan.aiMsgPerDay (Unlimited = always) |
| `ad-account-count` | active accounts + 1 ≤ plan.adAccountLimit + extraAdAccounts |
| `event-sdk` | add-on `event-sdk` in subscription.addOnKeys |
| `white-label` | plan.key ∈ {scale, enterprise} OR add-on `white-label` |
| `priority-ai` | add-on `priority-ai` |

`FeatureGateError.reason` is one of `TIER_LIMIT`, `ADDON_REQUIRED`,
`TRIAL_EXPIRED`, `SUSPENDED`. Each maps to a Thai user-facing message.

## Webhook contract

`POST /api/billing/webhook` accepts Omise events with header
`X-Omise-Signature` (HMAC-SHA256 with `OMISE_WEBHOOK_SECRET`). Reject
with 400 if signature invalid.

Processed events:
- `charge.complete` → mark Invoice PAID, set subscription
  status=ACTIVE, send invoice-paid email
- `charge.failed` → mark Invoice FAILED, set status=PAST_DUE,
  send invoice-failed email
- `dispute.create` → set status=SUSPENDED, alert admin
- All events: insert `BillingEvent` keyed by Omise event ID
  (idempotency)

## Refund policy

- Within 7 days of charge: pro-rated refund available via
  Settings → Billing → "ขอคืนเงิน"
- Formula: `refund = invoice.amount × max(0, daysInPeriod - daysUsed) / daysInPeriod`
- Action: call Omise refund → mark Invoice REFUNDED →
  status=CANCELLED → revoke access at end of `currentPeriodEnd`
- After 7 days: refund denied; user can still cancel
  to stop renewal

## Acceptance criteria

- [x] Designed: pricing tiers + add-ons all end in 90/990
- [ ] Implemented: User cannot enter `/t/<slug>/*` without an active or trialing subscription (redirect to `/signup-payment`)
- [ ] Implemented: Card is required (Omise customer with `default_card` set) before trial starts
- [ ] Implemented: Cron triggers reminder emails at day -2, -1, 0 (idempotent — won't double-send on rerun)
- [ ] Implemented: Failed Omise charge → status=PAST_DUE, then SUSPENDED after 3 days
- [ ] Implemented: Webhook is idempotent (rerunning same Omise event ID does not create duplicate Invoices)
- [ ] Implemented: AI chat returns 402 with Thai message when daily cap reached (no AI cost incurred)
- [ ] Implemented: Event SDK endpoints return 402 if `event-sdk` add-on inactive
- [ ] Implemented: Adding 4th Meta account on Starter (limit 1) returns 402 with upgrade prompt
- [ ] Implemented: Refund within 7d → Invoice REFUNDED, Omise refund recorded, access ends at period end
- [ ] Implemented: 30-day ad-spend rollup crosses tier threshold for ≥14 days → banner appears with upgrade CTA
- [ ] Implemented: All prices/emails/banners are Thai-localized
- [ ] Implemented: VAT 7% breakdown visible on every Invoice receipt

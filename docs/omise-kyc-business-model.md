# AdsLab — Business Brief for Omise KYC (Sole Proprietor)

**Submission to:** support@omise.co
**Subject:** AdsLab merchant onboarding — supporting documents (individual)
**Merchant URL:** https://adslab-theta.vercel.app
**Registration type:** Individual / สอดล (บุคคลธรรมดา)

---

## 1. What is AdsLab?

AdsLab is a Thai-localized **Software-as-a-Service (SaaS) platform** that helps
Thai media buyers and digital marketing agencies **optimize their Facebook /
Instagram (Meta) advertising campaigns** through AI-assisted analytics, audience
management, and conversion tracking tools.

**We are a software tool. We do not:**
- Buy or sell advertising space
- Process or hold advertising spend on behalf of clients
- Resell access to Meta or any other platform
- Act as a payment intermediary for advertising transactions
- Provide marketplace, escrow, or transaction-clearing services

The customer's relationship with Meta for ad spend stays direct and separate.
AdsLab only reads the customer's Meta data (via their own Meta Marketing API
access token) and writes optimization actions back when the customer requests
them via our UI or AI assistant.

## 2. Revenue Model

**Recurring SaaS subscription** charged in **Thai Baht (THB)**, billed monthly
or yearly via Omise:

| Tier | Monthly | Yearly | Target Customer |
|---|---|---|---|
| Starter | ฿1,490 | ฿14,990 | Solo media buyer, < ฿10k/mo ad spend |
| Growth | ฿3,890 | ฿38,990 | Small agency, ฿10k–฿30k spend |
| Pro | ฿10,990 | ฿109,990 | Agency, ฿30k–฿100k spend |
| Scale | ฿44,990 | ฿449,990 | Agency, ฿100k–฿500k spend |
| Enterprise | Custom | — | > ฿1M spend (sales-led, manual invoicing) |

**Add-ons** (optional, on top of base):
- Event SDK + Pixel Tracking — ฿590/mo
- Extra Ad Account — ฿190/account/mo
- White-label Reports — ฿490/mo (free for Scale+)
- Priority AI (Claude Opus) — ฿890/mo

All prices VAT-inclusive at the standard 7% rate. As individual operator I am
not currently VAT-registered (will register and convert to juristic person once
revenue passes the ฿1.8M/year threshold).

**Average ticket size**: ฿1,490–฿10,990 per customer per month.
**Expected transaction volume**: 50–500 charges per month initially, scaling
gradually as the closed beta opens up.

## 3. Customer Acquisition

- **Closed beta** at present (~50 dogfood users including myself).
- **No paid acquisition channels** active. Growth via:
  - Word-of-mouth in the Thai media-buyer community
  - My personal network (I'm an active Thai media buyer managing
    31 Meta ad accounts under one Business Manager — AdsLab is the tool
    I built for my own daily workflow)
  - Organic content (planned for Q3 2026)
- **No affiliate or referral payouts**.

## 4. Service Delivery

- 100% software-as-a-service via web app at https://adslab-theta.vercel.app
- No physical goods shipped
- No digital downloads sold
- Customer gets immediate access to dashboard upon subscription start
- 7-day free trial — credit card required upfront, no charge during trial
- Cancellable at any time via Settings → Billing in-app

## 5. Refund Policy (excerpt — full at /refund-policy)

- **Trial cancellation**: no charge if cancelled before day 8
- **Pro-rated refund within 7 days of new billing cycle** — calculated as
  `payment × (remaining_days / total_days_in_period)`
- **Post-trial cancellation**: access continues until end of paid period, no
  refund issued at cancellation, no further auto-renewal
- **No refund** beyond 7-day window or for accounts suspended due to ToS
  violation

Refund process: customer clicks "ขอคืนเงิน" in Settings → Billing → refund
processed via Omise refund API → credit returns to original card in 5–10
business days.

## 6. Risk + Compliance

**Chargeback risk**: low. SaaS recurring subscriptions with explicit consent
checkbox before payment, clear 7-day trial, transparent pricing displayed
before signup, refund policy linked from checkout, in-app cancellation always
available.

**Fraud prevention**:
- Email verification required before payment setup
- Card tokenized client-side via Omise.js (PCI scope minimized)
- HMAC-signed webhook signature verification
- Idempotent event handling
- Rate-limited API endpoints

**Regulatory compliance**:
- PDPA (Thailand) — full privacy policy at /privacy
- VAT 7% inclusive in displayed prices (will register VAT once revenue passes
  the threshold)
- Terms of Service accepted before payment via mandatory checkbox
- No personal financial data collected beyond what Omise needs

## 7. Technology Stack

- **Frontend**: Next.js 16 on Vercel
- **Database**: Neon (Postgres) — Singapore region
- **Email**: Resend
- **AI**: OpenRouter (Claude Sonnet 4.6 + Gemini Flash)
- **Payment**: Omise (THB only)
- **Auth**: iron-session (encrypted cookie)
- **Encryption**: AES-256-GCM for stored Meta access tokens

## 8. Why I chose Omise

- THB-native pricing display (no currency conversion to customer)
- Recurring billing via customer + saved card flow
- Local Thai support, Thai-language dashboard
- PCI DSS Level 1 certified
- Webhook-based reconciliation
- Test mode with realistic event delivery for QA

## 9. About the operator

- **Name**: [TODO: full Thai name as on ID card]
- **Background**: Active Thai media buyer with 10+ years experience.
  Currently managing 31 Meta ad accounts under one Business Manager.
  Founded AdsLab in 2026 to ship the daily-workflow tooling I needed myself.
- **Location**: Thailand
- **Plan**: Operate as sole proprietor through the beta and early-stage,
  then convert to นิติบุคคล once revenue stabilizes (Q4 2026 target).
- **Customer support**: Email reply within 24 business hours
- **Operating hours**: Mon–Fri 9:00–18:00 ICT

## 10. Supporting documents attached

1. National ID card (บัตรประชาชน) — front + back
2. Bank book first page (matching name on ID card)
3. Bank statement, recent 3 months
4. Screenshot of customer dashboard
5. Screenshot of admin / billing settings showing pricing transparency
6. This document

---

**Contact:**

- Email: [TODO: business email]
- Phone: [TODO: phone number]
- Website: https://adslab-theta.vercel.app

---

> Note: replace every `[TODO: ...]` placeholder before sending. Match the name
> on this document to the name on your national ID exactly so Omise's KYC
> reviewers can cross-reference quickly.

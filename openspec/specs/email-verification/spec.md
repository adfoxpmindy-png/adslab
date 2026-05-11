# Spec: Email Verification

**Capability:** Email verification via single-use, time-bound tokens. Required for new signups; unverified users can still log in but see a banner reminder.

## Data model

```
EmailVerificationToken
  id, userId (FK), token UNIQUE, expiresAt, usedAt nullable, createdAt
  INDEX(userId)
```

## Lifecycle

1. **Issuance** — `POST /api/auth/signup` creates one token (UUID v4) inside the same transaction as User/Tenant.
2. **Delivery** — verification email sent via `sendEmail()` (Resend) best-effort; failure logs but does not abort signup.
3. **Verification** — User clicks `${APP_URL}/verify-email?token=<uuid>`:
   - Server component renders the result of `verifyEmailToken(token)`.
   - On `success`: `User.emailVerifiedAt = now()` and `Token.usedAt = now()` atomically (Prisma transaction).
4. **Resend** — `POST /api/auth/resend-verification`:
   - Requires a session.
   - Refuses if user is already verified (`400`, error: "อีเมลของคุณยืนยันเรียบร้อยแล้ว").
   - Otherwise issues a *new* token (the old one is left as-is — multiple unused tokens are acceptable; each is still single-use).

## Token semantics

- Lifetime: **24 hours** from `createdAt`.
- Single-use: once `usedAt` is set, status is `used` permanently.
- Statuses returned by `verifyEmailToken(token)`:
  - `success { userId }` — valid, unused, not expired → marks used + verifies user
  - `expired` — past `expiresAt`
  - `used` — `usedAt` is already set
  - `invalid` — token is empty, too short (<8 chars), or not found

## Contract

### `POST /api/auth/verify-email`

Body: `{ token: string ≥8 }`.

Responses:
- `200 { status: "success", userId }` — token verified, user marked verified
- `404 { status: "invalid" }` — unknown / malformed token
- `410 { status: "used" | "expired" }` — token gone (used or past expiry)

### `POST /api/auth/resend-verification`

Auth: session required. No body.

Responses:
- `200 { ok: true }` — new token created + email queued
- `401 { error: "กรุณาเข้าสู่ระบบ" }` — no session
- `400 { error }` — already verified, or email send failure

### `/verify-email` page (Server Component)

- Reads `?token=` from `searchParams` (awaited in Next.js 16).
- Calls `verifyEmailToken(token)` server-side — no loading flash.
- Renders one of four UI states based on the result. If user is logged in and result is `expired`/`invalid`, shows `<ResendButton />` (client component) that calls the resend API.

## Acceptance criteria

- [x] Signup creates exactly one token, email send is awaited but errors are caught
- [x] Valid token → 200; user's `emailVerifiedAt` is non-null after verification
- [x] Replaying a verified token → 410 `used`
- [x] Expired token (after 24h) → 410 `expired`
- [x] Garbage / too-short token → 404 `invalid`
- [x] Resend without session → 401
- [x] Resend by already-verified user → 400 with friendly Thai message
- [x] Unverified users CAN log in but the dashboard layout renders `<UnverifiedBanner />`

## Out of scope

- Password reset tokens (Phase 2) — will likely follow this exact pattern
- Email change flow
- Pre-issued tokens for admin-created users

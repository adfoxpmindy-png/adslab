# Spec: Authentication

**Capability:** User authentication via email + password with encrypted session cookies.

## Contract

### Signup — `POST /api/auth/signup`

Body schema (validated with zod):
```ts
{ name: string ≥2 ≤64, email: <RFC>, password: string ≥8, tenantName: string ≥2 ≤64 }
```

Behavior:
- Normalize email → lowercase before lookup/insert
- Generate tenant slug from `tenantName` (kebab-case, ASCII; append `-N` until unique)
- Hash password with bcryptjs, 10 rounds
- Create User + Tenant + TenantMember (role `OWNER`) + EmailVerificationToken (UUID v4, 24h expiry) in a single Prisma transaction
- Set session cookie immediately after success
- Trigger verification email (best-effort — log error but don't fail the request)

Responses:
- `201` → `{ ok: true, user, tenant }` — on success
- `400` → `{ error, fieldErrors? }` — validation failure
- `409` → `{ error, fieldErrors: { email } }` — email already in DB

### Login — `POST /api/auth/login`

Body: `{ email, password }`.

Behavior:
- Lookup user by email (lowercase)
- bcrypt-compare password
- On success: set session, return `{ ok, user, redirectTo }` where `redirectTo` is `/t/<first-tenant-slug>/dashboard`
- On failure: return generic 401

Responses:
- `200` → `{ ok: true, user, redirectTo }`
- `400` → `{ error, fieldErrors? }` — validation failure
- `401` → `{ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }`

### Logout — `POST /api/auth/logout`

Behavior: destroy session cookie. Always returns `200 { ok: true }` (idempotent — never reveals whether a session existed).

## Acceptance criteria

- [x] Email+password signup creates User + Tenant + Membership + Token atomically
- [x] Duplicate email → `409`; weak password (<8) → `400` with `fieldErrors.password`
- [x] Slug generator handles Thai-only input by falling back to a random ASCII slug
- [x] `verifyPassword(plaintext, hash)` returns `true` only for matching bcrypt hash
- [x] Wrong password and unknown email return the *same* `401` body (no user enumeration)
- [x] Logout always returns `200` regardless of session state
- [x] Session cookie: `httpOnly`, `sameSite=lax`, `secure` in production, 30-day `maxAge`
- [x] `requireSession()` redirects to `/login` if session is missing/invalid (server components only)

## Security invariants

- Plaintext passwords MUST never be logged or stored
- Session payload (`userId`, `email`, `name`) is encrypted with `SESSION_SECRET` via iron-session
- `SESSION_SECRET` MUST be ≥32 bytes of base64; rotate on any suspected compromise

## Out of scope (handled elsewhere)

- Tenant authorization checks → see `multi-tenancy/spec.md`
- Email verification token lifecycle → see `email-verification/spec.md`
- Password reset / 2FA / OAuth → Phase 2+

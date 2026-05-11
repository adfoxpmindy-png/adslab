# Spec: Multi-Tenancy

**Capability:** Path-based multi-tenant routing with role-based access control. Every tenant-scoped page lives under `/t/[tenantSlug]/...`.

## Data model

```
Tenant         (id, name, slug UNIQUE, createdAt, updatedAt)
TenantMember   (id, userId, tenantId, role: Role, createdAt)
               UNIQUE(userId, tenantId), INDEX(tenantId)
Role           enum: OWNER | MEDIA_BUYER | VIEWER
```

Every Tenant-scoped query MUST filter by `tenantId` at the API/server layer. **Row-Level Security is explicitly NOT used** — authorization runs in application code.

## Defense in depth

Two layers gate every request to `/t/[slug]/...`:

### Layer 1 — Edge proxy (`src/proxy.ts`)

- Matcher: `/t/:path*`
- Check existence of cookie `adslab_session`
- If missing: respond `307 → /login?next=<original-path>`
- Does NOT decrypt the cookie — fast, edge-runtime-safe

### Layer 2 — Tenant layout (`src/app/t/[tenantSlug]/layout.tsx`)

- Call `requireTenantMember(tenantSlug)` which:
  - Calls `requireSession()` → redirects to `/login` if invalid
  - Queries `Tenant` by slug, filtering `members` by `userId`
  - If tenant missing OR `members.length === 0`: call `notFound()` → renders 404
  - If `allowedRoles` is supplied and user's role is not in it: `notFound()`
- Wrapped in React `cache()` so the same call from page + layout hits DB once per request

## Contract

### `requireTenantMember(slug, allowedRoles?)`

Returns `{ tenant: { id, name, slug }, role }` or short-circuits via `redirect()` / `notFound()`.

### Login redirect target

After successful login, redirect to `/t/<firstTenantSlug>/dashboard` where `firstTenantSlug` is the slug of the user's earliest-created `TenantMember`.

## Acceptance criteria

- [x] `/t/anything/...` without `adslab_session` cookie → `307` to `/login?next=...`
- [x] Valid session but non-existent tenant slug → `404` (not 401/403 — don't leak existence)
- [x] Valid session, valid tenant, but user is NOT a member → `404` (same response as non-existent)
- [x] Valid session + valid tenant + member → page renders
- [x] Invalid/stale cookie → `307 → /login` (layer 2 catches what proxy let through)
- [x] `requireTenantMember` wrapped in `cache()` — multiple calls within one request = one DB query

## Phase-2 deferrals

- Subdomain-based tenants (`tenant.adslab.app`) — currently path-based only
- Role-based feature gates inside the dashboard — currently only `notFound()` on role mismatch
- Cross-tenant data sharing or invites

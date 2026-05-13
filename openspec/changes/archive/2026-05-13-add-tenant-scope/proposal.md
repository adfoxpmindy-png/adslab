# Phase 6b — Tenant-level Scope (account + campaign default)

## Why

User pointed out the AdsLab Demo Agency tenant currently exposes all
31 ad accounts + every campaign across them. What they actually want:
each tenant = one client context. "Tenant Digittribe" should default
to managing only the Digittribe ad account + only the CPS campaigns.

Phase 6a built per-user account picker — useful as a personal filter,
but the *default* for the whole tenant should come from the tenant
itself, not from each user setting their own. Adding tenant-level
default scope makes new team members inherit the right view, and lets
a single owner-operator agency keep all clients organized inside one
AdsLab login.

## What Changes

### New: `TenantScope` DB model
- `tenantId` (unique)
- `accountIds: Json?` — null = all accounts, array = subset
- `campaignIds: Json?` — null = all campaigns under selected accounts,
  array = subset
- One row per tenant. OWNER can edit.

### New: server helper `getEffectiveScope(userId, tenantId)`
Returns merged scope:
- Tenant scope defines the **universe** of accessible accounts/campaigns
- User preference further **narrows within** that universe
- If user preference exceeds tenant scope, intersection wins

### Changed: Settings page
- Add **Tenant Scope** section (above existing Meta integration card)
- OWNER picks default accounts + (optionally) drills into campaigns
- Save button persists `TenantScope` row

### Changed: PlatformBar / pages
- Pages now respect *effective scope* (tenant ∩ user override) instead of
  raw user preference
- AccountPicker dropdown shows only accounts within tenant scope
- Campaign-aware queries (Dashboard, Campaigns, Reports) also filter by
  effective `campaignIds` when set

### Out of scope (future)
- Multiple named scopes per tenant ("Q1 CPS focus", "Q2 expansion") —
  the existing `ReportScope` model already handles named scopes for
  reports. We could extend that pattern later.
- Cross-tenant Meta connection sharing (right now each tenant has its
  own Meta OAuth — moving 31 accounts into separate tenants would
  require re-connecting). Defer to a dedicated proposal if needed.

## Impact

- New file `src/lib/tenant-scope.ts` (helper + types)
- New API `src/app/api/tenant-scope/route.ts`
- Modified `src/lib/account-preference.ts` → wrap with effective-scope logic
- Modified pages: dashboard, campaigns, reports, audiences (apply
  effective scope instead of raw user pref)
- New UI section in `src/app/t/[tenantSlug]/settings/integrations/page.tsx`
  (or new tab/page if it grows)

## Risks

1. **Migration**: existing tenants have no scope row → null = "all" so
   no breakage; first-time owner edits creates the row.
2. **Confusion**: user might think "Tenant Scope" overrides their personal
   filter — UI must show clearly that personal filter is *within* tenant
   scope.
3. **Campaign id volatility**: Meta campaign ids can be deleted/archived;
   stored campaignIds may go stale. Render with "X campaigns no longer
   exist" hint when stale ids detected.

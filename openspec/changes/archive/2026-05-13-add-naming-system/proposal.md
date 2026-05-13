# Phase 6d — Name Pattern Filter + Naming Standards

## Why

After Phase 6b shipped tenant-level scope, the user pointed out a
maintenance problem: scope stores **explicit campaign IDs**, so when
they create a new campaign next month (CPS0626) it won't be auto-pinned
to scope unless they remember to re-save Settings.

Real media-buying ops always name campaigns by convention:
  - `CPS0426`, `CPS0526`, `CPS0626` — Conversion campaign per month
  - `Lead_BKK_202606` — Lead campaign per region per month
  - `FROST - Sales - Q2` — themed multi-month run

We can leverage this convention two ways:
  1. **Auto-include by pattern** — scope rule "name contains CPS" → all
     current + future CPS campaigns roll into scope.
  2. **Naming standards** — define templates the team uses, then
     Campaign Builder auto-suggests valid names → consistency without
     enforcement.

Both are small features individually, but together they make naming
the discoverable backbone of scope organization.

## What Changes

### 6d.1 — Name Pattern Filter (extends TenantScope)
- **DB**: `TenantScope.campaignNamePatterns: Json?` —
  `Array<{ pattern, kind: "contains"|"starts_with"|"regex", caseInsensitive?: boolean }>`
- **Server**:
  - `expandCampaignPatterns(tenantId, patterns, restrictToAccountIds)`
    queries MetaCampaign rows whose name matches at least one pattern.
  - `getEffectiveScope` unions explicit campaignIds with matched IDs.
- **UI**: `<NamePatternSection>` inside TenantScopeCard
  - List existing patterns + add/remove
  - Live preview: "match N campaigns ตอนนี้" with first 5 examples

### 6d.2a — Naming Standards (Settings)
- **DB**: `NamingTemplate` model — tenantId, name, pattern, description,
  isDefault, audit fields.
- **Pattern syntax**: `{MM}` `{YY}` `{YYYY}` `{DD}` `{Month}` `{Custom}`
- **Server**: `src/lib/naming-template.ts` — `renderTemplate`,
  `templateToRegex`, `detectPatternsFromNames`.
- **API**: `GET/POST /api/naming-templates`, `PATCH/DELETE /api/naming-templates/[id]`
- **UI**: `<NamingTemplatesCard>` in Settings — CRUD list, "+ เพิ่ม Template" modal with
  placeholder chips + live preview.

### 6d.2b — Campaign Builder Smart Name
- **UI**: `<SmartNameField>` replaces the plain Input for campaign name.
  - Loads tenant templates on mount.
  - Shows default templates as one-click chips (auto-fills placeholders
    with current BKK date).
  - Live regex check → "✓ ตรง template" badge when match.
  - Empty-state hint when tenant has no templates yet.

### 6d.2c — AI Analyze Existing Names
- **API**: `POST /api/naming-templates/ai-suggest` — sends recent
  campaign names to Claude (lite mode), returns JSON
  `{ templates: [{name, pattern, description, evidence_examples}], notes }`.
- **UI**: AI suggest modal — auto-runs on open, shows suggestions with
  "+ ใช้" button per template.

## Impact

- New file `src/lib/naming-template.ts`
- New tables: `NamingTemplate`, new field on `TenantScope`
- New routes: 4 endpoints
- New UI components: 2 cards + 1 inline field
- Modified: tenant-scope helper, TenantScopeCard, Settings page,
  Campaign Builder

## Out of Scope (future)

- Apply naming convention retroactively (rename existing campaigns)
- Per-objective templates (Conversion vs Awareness)
- Auto-suggest based on tenant scope context (e.g. if scope is
  `contains "CPS"`, default to a CPS template)
- Multi-region / multi-language templates

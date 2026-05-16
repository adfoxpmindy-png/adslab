# Redesign — Design System Foundation (Phase A)

## Why

Designer (founder's partner) delivered 6 high-fidelity mockups that
establish a far more polished visual language than what we shipped in
Phase 1–9. The mockups show:

- Indigo→violet→pink gradient brand identity (matches new logo)
- Card-based layout with generous whitespace
- KPI cards, hierarchical data tables, mindmap visualizations
- Multi-step AI Campaign Builder with right-pane plan preview
- AI Optimization Center + Competitor Ads Spy (net-new features)

Before any page-level redesign work, we need the foundation: design
tokens, shared component primitives, and updated brand assets. Without
this, every page redesign drifts and inconsistencies pile up.

This change ships **only the foundation** — no page rewrites yet. Those
land in follow-up changes (`redesign-dashboard`, `redesign-campaigns`,
etc.) that all depend on this one.

## What Changes

### A.1 — Design tokens (`src/app/globals.css`)

- Brand colors:
  - `--brand-indigo: oklch(0.58 0.20 270)`
  - `--brand-violet: oklch(0.61 0.22 295)`
  - `--brand-pink: oklch(0.72 0.18 340)`
  - `--brand-gradient: linear-gradient(135deg, indigo, violet, pink)`
- Status colors: emerald (success), amber (warning), red (destructive), sky (info)
- Surfaces: card / muted / sidebar — refined neutrals
- Shadows: `--shadow-card`, `--shadow-card-hover`, `--shadow-popover`
- Radius scale: `--radius-sm | md | lg | xl | 2xl | 3xl`
- Typography:
  - Thai stays IBM Plex Sans Thai
  - English/numbers: Inter (already loaded) — add tabular-nums utility
- Tailwind tokens via `@theme inline { … }` so we get `bg-brand`, `text-brand`, `from-brand-indigo to-brand-pink` everywhere

### A.2 — Brand assets

- `/public/adslab-logo-new.png` — new gradient logo from founder (replaces existing)
- Favicon: regenerate from new logo
- OpenGraph image: regenerate

### A.3 — Shared component primitives (`src/components/ui-system/`)

- `<KpiCard>` — icon (in colored circle) + label + big number + delta badge + comparison subtitle
- `<StatusBadge>` — pill, variants: active / paused / closed / warning / info / success / neutral
- `<BrandGradientButton>` — primary CTA with indigo→violet gradient + hover lift
- `<MetricDelta>` — `+12.3%` with arrow icon + color (red/green) + neutral comparison
- `<SectionHeader>` — title + optional subtitle + right-side actions
- `<DataTableShell>` — table primitive supporting expandable rows, sticky header, column toggle
- `<EmptyState>` — friendly empty with illustration slot + CTA

Each primitive ships with Storybook-style usage examples in JSDoc.

### A.4 — Shell components (Sidebar + Topbar)

These are visible on every authenticated page — redesign first so all
later page work inherits consistent shell:

- `<Sidebar>` — 240px white, AdsLab logo top, nav items with gradient active state, "Upgrade" promotion card mid, user avatar bottom-left
- `<Topbar>` — page title + subtitle area (slot), date range picker (right), notification bell, user dropdown
- Active-item indicator: indigo-to-violet gradient background + white text

### A.5 — Sidebar nav simplification

Current sidebar has many items (Dashboard, Campaigns, Goals, Audiences, Events, Journey, AI, Reports, Settings…). Designer's mockup shows fewer, broader items:

- ภาพรวม (Overview / dashboard)
- แคมเปญ (Campaigns — flat + structure view inside)
- กลุ่มเป้าหมาย (Audiences)
- ครีเอทีฟ (Creatives — new)
- รายงาน (Reports)
- AI Optimize (NEW — Phase C)
- เครื่องมือ (Tools — collapses Events/Journey/Naming under one umbrella)
- ตั้งค่า (Settings)

We restructure routing in `redesign-dashboard` change; for now sidebar
just renders the items it's given. We update the structure here as a prep step.

## Impact

**New files**:
- `src/components/ui-system/{kpi-card,status-badge,brand-button,metric-delta,section-header,data-table-shell,empty-state}.tsx`
- `src/components/tenant/sidebar-v2.tsx` (replaces existing sidebar)
- `src/components/tenant/topbar-v2.tsx` (replaces existing topbar)
- `openspec/specs/ui-design-system/spec.md` (new capability spec)

**Modified**:
- `src/app/globals.css` — design tokens
- `src/app/layout.tsx` — `<html className="bg-canvas">`-style top-level adjustments
- `src/app/t/[tenantSlug]/layout.tsx` — swap sidebar/topbar imports
- `public/adslab-logo.png` — replaced

**No breaking changes to data/API** — purely visual + structural.

## Risks

1. **Component drift**: redesigning primitives + every consuming page in one PR is huge. Mitigation: this change ships ONLY primitives + shell. Pages stay on old design until their dedicated change.
2. **Dark mode parity**: current app supports light + dark. Mockups are light only. We must derive dark-mode colors that match the gradient identity. Punt to follow-up if time-tight.
3. **Plex Thai + Inter pairing**: must ensure number columns get `font-variant-numeric: tabular-nums` so currency columns align.

## Out of Scope (defer)

- Page-level redesigns (separate OpenSpec changes per page)
- Dark mode refinement (light-first; dark gets cleaned up after light is stable)
- Animation library (we'll use plain CSS + Tailwind transitions for now)
- New competitor-spy feature (separate change)

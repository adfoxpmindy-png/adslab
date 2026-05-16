## Context

Phase 1–9 of AdsLab shipped with a cyan-accented design that worked but never coalesced into a strong visual identity. The founder's design partner delivered 6 high-fidelity mockups establishing a far more polished language: **indigo → violet → pink gradient** brand, card-heavy layout, KPI-forward dashboards, and several new pages (AI Optimize Center, Competitor Spy). Mockups also reorganize the sidebar from 8 narrow items to 7 broader ones.

Doing the redesign as one mega-PR is asking for drift and review fatigue — every page in the app would be touched. Instead this change ships **only the foundation**: tokens, primitives, shell. Page-level redesigns (`redesign-dashboard`, `redesign-campaigns`, etc.) become follow-up changes that all depend on this one.

Constraint: Next.js 16 / Tailwind v4 / Base UI primitives — no styled-components, no CSS-in-JS, no new runtime deps. Thai/Latin font pairing must preserve readability while introducing tabular numerals for currency tables. Dark-mode parity must hold (current app supports light + dark and many users actually use dark).

## Goals / Non-Goals

**Goals:**
- Single source of truth for brand identity (token-defined, never hardcoded hex).
- 7 reusable primitive components that every redesigned page can compose from.
- New `SidebarV2` + `TopbarV2` shell that all authenticated pages inherit.
- Information-architecture simplification — sidebar from 8 nav items → 7 broader ones (with sub-pages tucked under "เครื่องมือ" / "แคมเปญ").
- Light + dark mode parity for every new token and primitive.
- Page-level rewrites can land independently after this lands.

**Non-Goals:**
- No page rewrites in this change (they're separate follow-ups).
- No new pages (AI Optimize Center + Competitor Spy belong in their own changes).
- No animation library — Tailwind transitions only.
- No Storybook (deferred — may revisit when primitive count > 15).
- No new icon library — keep lucide-react.

## Decisions

### D1: OKLCH color space for brand tokens
**Choice:** Define `--brand-indigo`, `--brand-violet`, `--brand-pink` in OKLCH (e.g. `oklch(0.58 0.20 270)`) — not HSL or hex.

**Why over alternatives:**
- OKLCH is perceptually uniform: the lightness component (`0.58`) actually *looks* the same brightness across hues, unlike HSL where `hsl(270, 50%, 50%)` is much darker than `hsl(60, 50%, 50%)`. This lets us derive dark-mode variants by just shifting L, not the whole color.
- Browser support is solid in 2026 (Chrome 111+, Safari 15.4+, Firefox 113+).
- Tailwind v4 supports OKLCH first-class through `@theme inline`.

**Trade-off:** Slightly less familiar than hex. Mitigated by always pairing token name (`--brand-indigo`) with a sample swatch comment.

### D2: Gradient used sparingly — at most 1 surface per viewport
**Choice:** The indigo→violet→pink gradient is a **statement** color: applied to the logo, the primary CTA button, the sidebar active-nav state, and AI feature badges. Forbidden everywhere else.

**Why over alternatives:**
- Overuse turns the gradient into wallpaper and loses the visual hierarchy it's meant to create.
- Established premium SaaS (Linear, Notion, Vercel) all use their accent color this sparingly; the redesign mimics that restraint.

**Trade-off:** Designers and devs may feel the urge to "spice up" sections by adding gradient. Cure: code review + `data-brand="primary"` audit during PR.

### D3: Tailwind `@theme inline` not Tailwind config
**Choice:** Tokens live in `globals.css` under `@theme inline { --color-brand-indigo: var(--brand-indigo); ... }` rather than `tailwind.config.js`.

**Why over alternatives:**
- Tailwind v4 deprecates the config-file path; `@theme inline` is the canonical way to expose CSS variables as Tailwind utilities.
- Same tokens serve both CSS-direct (`color: var(--brand-indigo)`) and Tailwind utilities (`bg-brand-indigo`) — single source.
- Hot-reload works without restarting the dev server when tokens change.

**Trade-off:** Devs unfamiliar with Tailwind v4 may look in the wrong file first. Add a `// Tokens live in globals.css under @theme` comment in `tailwind.config.ts` to redirect.

### D4: 7 primitive components, no more for this round
**Choice:** Ship exactly 7 primitives — `KpiCard`, `StatusBadge`, `BrandButton`, `MetricDelta`, `SectionHeader`, `DataTableShell`, `EmptyState`. Resist the urge to add more until a real page needs them.

**Why:**
- A primitive without a clear page consumer becomes a "framework" that drifts from real usage.
- Each of these 7 has at least 2 mockup pages that need it.
- Future primitives (like `FilterChips`, `TimelineEntry`) land when their consuming page is built.

**Trade-off:** Some page-level redesigns will need 1-off components until they're promoted to primitives. Acceptable.

### D5: Replace, don't extend, the old Sidebar/Topbar
**Choice:** Create `SidebarV2` and `TopbarV2` as net-new files, swap the tenant layout to import them, then delete the originals once verified.

**Why over an `if (NEW_DESIGN) {...}` flag:**
- Visual redesigns flag-gate badly — half-redesigned navigation is jarring.
- Old sidebar had accumulated 9 months of accreted edge cases; clean cut beats incremental refactor.
- Easy rollback: revert the layout import.

**Trade-off:** Brief duplicated code during transition. Mitigated by deleting old files in the same PR once tests pass.

### D6: Sidebar IA simplification — bundle smaller features under broader umbrellas
**Choice:**
- "เครื่องมือ" (Tools) becomes a hub for Events / Journey / Naming / Competitor Spy — they all live as sub-pages under one nav item.
- Goals folds into the Campaigns page (per-campaign goal editor).
- Reports stays separate but `/reports` becomes the index page with the past-30-days digest as the default view.

**Why:**
- 8+ nav items at the same hierarchy level induces decision fatigue and makes the sidebar tall on small viewports.
- Mockups show a focused 7-item list; mirror that.
- Bundling sub-pages under "เครื่องมือ" lets us add 5+ minor tools without growing the sidebar.

**Trade-off:** One extra click to reach Events/Journey. Acceptable — those aren't daily-use pages for media buyers.

### D7: Server-rendered pages set their topbar title via a tiny React context
**Choice:** A `PageTitleProvider` lives in the tenant layout. Each page renders `<SetPageTitle title="..." subtitle="..." />` (client component, no body). Topbar consumes the context to render the title.

**Why over alternatives:**
- Server components can't directly hand data to a sibling client component (the topbar) without a context bridge.
- This pattern keeps the topbar *generic* (it doesn't import 10+ page-specific configs) and gives each page autonomy to set its own title.
- Same pattern surfaces page-specific actions (right-side topbar slot) without prop-drilling.

**Trade-off:** Adds one `"use client"` boundary per page. Cost is negligible since `SetPageTitle` renders nothing.

## Risks / Trade-offs

- **Risk:** Component drift between primitives and the eventual page-level redesigns — pages may want one-off variants ("KpiCard but with a sparkline") that bloat the primitive API.
  → Mitigation: hold the line — composable slots, not prop explosion. If a variant repeats across 3+ pages, promote it.

- **Risk:** Dark mode regression — the new tokens were authored in light first. Some primitives may look thin in dark mode.
  → Mitigation: every primitive ships with a manual dark-mode review screenshot in PR description. Phase-2 final-pass change cleans up any dark-mode-only issues found in production use.

- **Risk:** Sidebar IA change confuses existing users ("Where's Goals?").
  → Mitigation: in-app tooltip on the renamed/moved items for 14 days post-launch. Discord announcement.

- **Risk:** Logo replacement breaks favicon/OG/PWA icons.
  → Mitigation: regenerate all derived assets in same PR — favicon, OG image, manifest icons. Verify with `lighthouse --view`.

- **Risk:** The 7 primitive count is "right" for today's pages but wrong for tomorrow's.
  → Acceptable — adding primitives is cheap; the cost we're avoiding is the *premature* abstraction tax.

## Migration Plan

1. **Phase A (this change)** — tokens + primitives + shell + IA. Ship behind no flag (visual changes are immediately visible to everyone but no data semantics change).
2. **Phase B (separate changes)** — page-by-page redesigns: dashboard, campaigns, reports, ai-optimize. Each is a 1-2 day change.
3. **Phase C (post-launch)** — final-pass fixes discovered during real use. Already happened: see archived `redesign-final-pass` change for mobile drawer, page-header pattern, sidebar viewport positioning.

**Rollback:** revert the tenant layout import + delete v2 components. Old sidebar/topbar files would need to be unreverted (kept in git history).

## Open Questions

All resolved during implementation. The post-launch `redesign-final-pass` change addressed every issue that surfaced (page header inconsistency, mobile drawer, sidebar viewport height, theme toggle placement, dark-mode contrast).

This design.md is being authored retrospectively after the change shipped (2026-05-13) and after the follow-up `redesign-final-pass` already landed (2026-05-14) — to satisfy the OpenSpec schema before archiving this foundation change.

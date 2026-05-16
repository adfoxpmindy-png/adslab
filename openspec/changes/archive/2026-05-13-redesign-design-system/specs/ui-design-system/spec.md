# Spec: UI Design System (v2)

**Capability:** Brand-aligned design tokens, component primitives, and
app shell that all page-level UIs build on. New AdsLab visual identity
(indigo → violet → pink gradient) replaces the previous cyan accent.

## Brand identity

The brand is anchored by a 3-stop linear gradient: **indigo (270°)
→ violet (295°) → pink (340°)** in OKLCH color space. Applied to:

- Logo
- Primary CTA buttons
- Active sidebar nav state
- AI feature badges
- Gradient text accents on hero / landing

Used **sparingly** — at most 1 brand-gradient surface per visible
viewport, plus the sidebar active item. Overuse cheapens the effect.

## Design tokens (CSS custom properties)

Defined in `src/app/globals.css` under `:root` (light) and `.dark`.

```
--brand-indigo  --brand-violet  --brand-pink
--brand --brand-foreground

--canvas             page background
--background         card / panel bg
--surface-elevated   card-on-card

--success / -foreground
--warning / -foreground
--info    / -foreground
--destructive

--shadow-card          subtle 1-2px elevation
--shadow-card-hover    4-12px hover elevation
--shadow-popover       larger floating panels
```

Exposed to Tailwind via `@theme inline { --color-brand-indigo: …; … }`
so utilities like `bg-brand-indigo`, `from-brand-violet`, `shadow-card`
work in JSX.

## Typography

- Thai: **IBM Plex Sans Thai** (kept from previous design)
- English/Latin + numbers: **Inter** (already loaded)
- Tabular numerals for currency / metric columns:
  `.tabular-nums { font-variant-numeric: tabular-nums; }`

## Component primitives — `src/components/ui-system/`

| Component | Purpose | Reuse-target |
|---|---|---|
| `<KpiCard>` | Headline metric with icon + delta | Dashboard top row |
| `<StatusBadge>` | Status pill with dot + soft bg | Tables, cards |
| `<BrandButton>` | Gradient CTA, hover lift | Page primary actions |
| `<MetricDelta>` | Inline % change with arrow | KPI cards, table cells |
| `<SectionHeader>` | Title + subtitle + actions slot | Page + section headers |
| `<DataTableShell>` | Hierarchical table primitive | Campaigns, audiences |
| `<EmptyState>` | No-data placeholder with CTA | Every list view |

All primitives use Tailwind v4 utilities; no styled-components or CSS-in-JS.

## App shell — `src/components/tenant/`

| Component | Purpose |
|---|---|
| `<SidebarV2>` | 240px sidebar, white bg, gradient active state, upgrade card, user avatar |
| `<TopbarV2>` | Header with page title (from context), tenant switcher, notification, user dropdown |
| `<PageTitleProvider>` | React context so server-rendered pages can set the topbar title via a tiny client `<SetPageTitle>` component |

## Sidebar information architecture

| Old (8 items) | New (7 items) |
|---|---|
| Dashboard | ภาพรวม |
| Reports | (folded under แคมเปญ + ภาพรวม) |
| Campaigns | แคมเปญ |
| Audiences | กลุ่มเป้าหมาย |
| Journey | (folded under เครื่องมือ) |
| AI Master | AI Optimize |
| Goals | (folded under แคมเปญ) |
| Settings | ตั้งค่า |
| — | ครีเอทีฟ (new) |
| — | เครื่องมือ (Events / Journey / Naming bundled) |

## Acceptance criteria

- [x] Design tokens defined in `globals.css` for light + dark
- [x] Brand gradient utility classes (`.bg-brand-gradient`, `.text-brand-gradient`)
- [x] 7 primitive components shipped + typecheck clean
- [x] Sidebar v2 + Topbar v2 + PageTitleProvider in tenant layout
- [ ] All existing pages still render without errors (build pass)
- [ ] Sidebar active item correctly highlights on every route
- [ ] Logo replaced with new gradient PNG once founder uploads
- [ ] No regression in keyboard nav / focus rings / screen reader behavior

## Phase-2 deferrals

- Dark mode fine-tuning (current is light-first, dark inherited)
- Mobile responsive sidebar (current: hidden below lg breakpoint, same as v1)
- Animation library (CSS transitions only for now)
- Storybook (`/dev/components` route is a stretch goal)

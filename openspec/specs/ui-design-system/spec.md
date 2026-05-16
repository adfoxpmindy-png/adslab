# Spec: UI Design System

**Capability:** Brand-aligned design tokens, component primitives, and app shell that all page-level UIs build on. AdsLab's visual identity is anchored by an **indigo → violet → pink gradient** (replacing the previous cyan accent).

---

## Brand identity

The brand is a 3-stop linear gradient: **indigo (270°) → violet (295°) → pink (340°)** in OKLCH color space. Applied to:

- Logo
- Primary CTA buttons
- Active sidebar nav state
- AI feature badges
- Gradient text accents on hero / landing

Used **sparingly** — at most 1 brand-gradient surface per visible viewport, plus the sidebar active item. Overuse cheapens the effect.

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

Exposed to Tailwind via `@theme inline { --color-brand-indigo: …; … }` so utilities like `bg-brand-indigo`, `from-brand-violet`, `shadow-card` work in JSX.

## Typography

- Thai: **IBM Plex Sans Thai**
- English/Latin + numbers: **Inter**
- Tabular numerals for currency / metric columns: `.tabular-nums { font-variant-numeric: tabular-nums; }`

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
| `<TopbarV2>` | Header with page title (from context), tenant switcher, theme toggle, notification, user dropdown |
| `<MobileSidebar>` | Drawer variant of the sidebar for `< lg` viewports |
| `<MobileNav>` | Hamburger trigger that opens the drawer |
| `<PageTitleProvider>` | React context so server-rendered pages can set the topbar title via `<SetPageTitle>` |

## Sidebar information architecture

Old (8 items) → New (9 items including post-launch additions):

| Old | New |
|---|---|
| Dashboard | ภาพรวม |
| Reports | รายงาน |
| Campaigns | แคมเปญ |
| Audiences | กลุ่มเป้าหมาย |
| Journey | (folded under เครื่องมือ) |
| AI Master | (top-right floating button) |
| Goals | (folded under แคมเปญ) |
| Settings | ตั้งค่า |
| — | บูสต์ด่วน |
| — | กฎอัตโนมัติ |
| — | โฆษณา *(per-ad view + วิเคราะห์ภาพ button)* |
| — | ครีเอทีฟ |
| — | วิเคราะห์ *(AI Optimize Center)* |
| — | ความจำ AI *(AI learning loop history)* |
| — | เครื่องมือ *(Events / Journey / Naming hub)* |

## Page header pattern (consistency contract)

**Every** tenant-scoped page MUST use `<SetPageTitle title="..." subtitle="..." />` to feed the topbar — and MUST NOT render its own inline icon-block header in the page body.

The pattern looks like:

```tsx
return (
  <>
    <SetPageTitle title="..." subtitle="..." />
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
      {/* page content */}
    </div>
  </>
);
```

Forbidden (was the v1 pattern):

```tsx
// ❌ do not use
<header className="flex items-start gap-3">
  <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
    <Icon className="size-5 text-primary" />
  </div>
  <div>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">Eyebrow</p>
    <h1 className="text-2xl font-semibold tracking-tight">Title</h1>
  </div>
</header>
```

This eliminates page-to-page header inconsistency (different paddings, eyebrow text vs no eyebrow, different icon backgrounds).

Sub-pages can still render a `← back to X` breadcrumb inside the body — that doesn't belong in the topbar.

## Sidebar — viewport-locked positioning

The desktop sidebar MUST be sized to exactly viewport height, not stretched to the row height of the flex container.

```tsx
<aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-border bg-sidebar lg:flex">
```

Critical classes:
- `sticky top-0` — stays pinned to viewport top as the page scrolls
- `h-screen` — exactly 100vh
- `self-start` — opt out of `align-items: stretch` from the parent flex row
- `overflow-y-auto` — internal scroll for narrow viewports where sidebar content exceeds 100vh

Why: without `self-start + h-screen`, the sidebar inherits the row's height (which matches the tallest sibling — typically the main content). On pages with lots of content (e.g. a long campaign table), the sidebar stretched to the content height and pushed the user profile section thousands of pixels below the visible viewport. Now it's pinned at a consistent y-position regardless of page.

## Mobile responsive shell

### Breakpoint

`lg` (1024px). At `< lg`:
- Desktop `SidebarV2` is `hidden`
- `MobileNav` hamburger is `inline-flex` (left of topbar)
- `MobileSidebar` drawer is rendered (closed by default)

### Drawer behavior (`src/components/tenant/mobile-sidebar.tsx`)

| Trigger | Behavior |
|---------|----------|
| Tap hamburger | `setOpen(true)` — drawer slides in from left over backdrop |
| Tap backdrop | `onClose()` |
| Tap X button | `onClose()` |
| Press Escape | `onClose()` |
| Route change | `onClose()` (auto via `useEffect` on `pathname`) |

While open:
- `document.body.style.overflow = "hidden"` so the page behind doesn't scroll
- Restored on close via cleanup

### Drawer layout

- Width: `w-72 max-w-[85vw]` (288px or 85% of viewport, whichever is smaller)
- Height: `h-dvh` (full dynamic viewport — accounts for mobile browser UI)
- Logo + X button in 64px header strip
- Nav items below, same data as desktop sidebar (sourced from shared `sidebar-nav-items.ts`)
- Active item uses the same `bg-brand-gradient` styling as desktop

### Z-index layering

- Backdrop: `z-40`
- Drawer: `z-50`
- AIChat floating button: must remain accessible — verify it doesn't collide

## Shared nav source of truth

`src/components/tenant/sidebar-nav-items.ts` exports:

```ts
export const SIDEBAR_NAV_ITEMS: Array<{
  label: string;
  href: (tenantSlug: string) => string;
  icon: LucideIcon;
}>;

export function isPathActive(pathname: string | null, href: string): boolean;
```

Both `SidebarV2` (desktop) and `MobileSidebar` (mobile) MUST consume this — never inline the items in either component. Adding a new nav item is a one-file change.

## Acceptance

- [x] Design tokens defined in `globals.css` for light + dark
- [x] Brand gradient utility classes (`.bg-brand-gradient`, `.text-brand-gradient`)
- [x] 7 primitive components shipped + typecheck clean
- [x] Sidebar v2 + Topbar v2 + PageTitleProvider in tenant layout
- [x] Existing pages render without errors (build pass)
- [x] Sidebar active item correctly highlights on every route
- [x] Logo replaced with new gradient PNG
- [x] No regression in keyboard nav / focus rings / screen reader behavior
- [x] All 10+ tenant pages render with topbar title (no inline icon-block headers)
- [x] Desktop sidebar has identical bottom-left positioning across all pages
- [x] Mobile viewport (≤ lg) shows hamburger + working drawer
- [x] Drawer auto-closes on route change
- [x] Adding a nav item only requires editing `sidebar-nav-items.ts`

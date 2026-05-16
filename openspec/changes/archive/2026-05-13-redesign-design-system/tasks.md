# Redesign Design System — Tasks

## 1. Design tokens
- [x] 1.1 Update `src/app/globals.css` `:root` + `.dark` with brand tokens (indigo/violet/pink)
- [x] 1.2 Add gradient utilities (`--brand-gradient`, classes for `.bg-brand-gradient`, `.text-brand-gradient`)
- [x] 1.3 Add shadow scale (`--shadow-card`, `--shadow-card-hover`, `--shadow-popover`)
- [x] 1.4 Add radius scale + spacing scale touch-ups to match mockups (24-32px card padding)
- [x] 1.5 Configure Tailwind v4 `@theme inline` mapping so utilities like `bg-brand-indigo`, `from-brand-indigo`, `shadow-card` work

## 2. Brand assets
- [x] 2.1 Replace `public/adslab-logo.png` with new gradient logo + chroma-key alpha extraction so dark mode invert works correctly
- [x] 2.2 Verify favicon renders correctly (Next.js auto-uses logo if `icons.icon` is set in metadata)
- [x] 2.3 OG image: update path in `src/app/layout.tsx` metadata

## 3. UI-system primitives
- [x] 3.1 `src/components/ui-system/kpi-card.tsx` — icon circle + label + value + delta + comparison
- [x] 3.2 `src/components/ui-system/status-badge.tsx` — 6 variants (active, paused, closed, warning, info, neutral)
- [x] 3.3 `src/components/ui-system/brand-button.tsx` — gradient CTA + hover lift + icon slot
- [x] 3.4 `src/components/ui-system/metric-delta.tsx` — `+12.3%` with arrow + color
- [x] 3.5 `src/components/ui-system/section-header.tsx` — title + subtitle + right actions slot
- [x] 3.6 `src/components/ui-system/data-table-shell.tsx` — table primitive supporting expand/collapse rows (used by campaigns 3-level hierarchy)
- [x] 3.7 `src/components/ui-system/empty-state.tsx` — illustration + CTA

## 4. Shell components
- [x] 4.1 `src/components/tenant/sidebar-v2.tsx` — 240px sidebar with new logo, gradient active state, connect-accounts row, upgrade card, user profile
- [x] 4.2 `src/components/tenant/topbar-v2.tsx` — page title (context-fed) + tenant switcher + theme toggle + notification bell
- [x] 4.3 Update `src/app/t/[tenantSlug]/layout.tsx` to import v2 components
- [x] 4.4 Delete old sidebar/topbar after verifying v2 covers all use cases

## 5. Sidebar nav restructure
- [x] 5.1 Update sidebar nav items to: ภาพรวม / แคมเปญ / กลุ่มเป้าหมาย / ครีเอทีฟ / รายงาน / วิเคราะห์ / เครื่องมือ / การตั้งค่า
- [x] 5.2 "เครื่องมือ" is a hub page that links to Events / Journey / Goals / Competitor Spy / etc.
- [x] 5.3 "วิเคราะห์" links to the AI Optimization Center

## 6. Specs
- [x] 6.1 Write `openspec/specs/ui-design-system/spec.md` documenting the design system as a capability

## 7. Verify
- [x] 7.1 Build passes
- [x] 7.2 Pages render correctly on prod (manual visual verification across 10+ pages)
- [x] 7.3 No regressions on existing pages

## 8. Ship
- [x] 8.1 Commit + push
- [x] 8.2 Compare deployed shell with mockups, capture screenshots

## 9. Post-launch fixes (added during user review)
- [x] 9.1 Sidebar v2 IA mismatch — rewrote to match mockup exactly
- [x] 9.2 Logo cropping — sharp.trim + chroma-key alpha extraction
- [x] 9.3 Theme toggle missing — added back to topbar-v2
- [x] 9.4 Dark-mode platform chips unreadable — redesigned PlatformLogo
- [x] 9.5 Upgrade card invisible in dark mode — bumped opacity 30 → 40 + ring
- [x] 9.6 Inline page headers inconsistent across pages — migrated all 10 pages to SetPageTitle pattern
- [x] 9.7 Sidebar height differed per page (bottom-left inconsistent) — sticky top-0 h-screen self-start

# Redesign Design System — Tasks

## 1. Design tokens
- [ ] 1.1 Update `src/app/globals.css` `:root` + `.dark` with brand tokens (indigo/violet/pink)
- [ ] 1.2 Add gradient utilities (`--brand-gradient`, classes for `.bg-brand-gradient`, `.text-brand-gradient`)
- [ ] 1.3 Add shadow scale (`--shadow-card`, `--shadow-card-hover`, `--shadow-popover`)
- [ ] 1.4 Add radius scale + spacing scale touch-ups to match mockups (24-32px card padding)
- [ ] 1.5 Configure Tailwind v4 `@theme inline` mapping so utilities like `bg-brand-indigo`, `from-brand-indigo`, `shadow-card` work

## 2. Brand assets
- [ ] 2.1 Replace `public/adslab-logo.png` with new gradient logo
- [ ] 2.2 Verify favicon renders correctly (Next.js auto-uses logo if `icons.icon` is set in metadata)
- [ ] 2.3 OG image: update path in `src/app/layout.tsx` metadata

## 3. UI-system primitives
- [ ] 3.1 `src/components/ui-system/kpi-card.tsx` — icon circle + label + value + delta + comparison
- [ ] 3.2 `src/components/ui-system/status-badge.tsx` — 6 variants (active, paused, closed, warning, info, neutral)
- [ ] 3.3 `src/components/ui-system/brand-button.tsx` — gradient CTA + hover lift + icon slot
- [ ] 3.4 `src/components/ui-system/metric-delta.tsx` — `+12.3%` with arrow + color
- [ ] 3.5 `src/components/ui-system/section-header.tsx` — title + subtitle + right actions slot
- [ ] 3.6 `src/components/ui-system/data-table-shell.tsx` — table primitive supporting expand/collapse rows
- [ ] 3.7 `src/components/ui-system/empty-state.tsx` — illustration + CTA

## 4. Shell components
- [ ] 4.1 `src/components/tenant/sidebar-v2.tsx` — 240px sidebar with new logo, gradient active state, promo card, user avatar
- [ ] 4.2 `src/components/tenant/topbar-v2.tsx` — title + breadcrumb + date picker + notification + user
- [ ] 4.3 Update `src/app/t/[tenantSlug]/layout.tsx` to import v2 components
- [ ] 4.4 Delete old `sidebar.tsx` + `topbar.tsx` after verifying v2 covers all use cases

## 5. Sidebar nav restructure
- [ ] 5.1 Update sidebar nav items to: ภาพรวม / แคมเปญ / กลุ่มเป้าหมาย / ครีเอทีฟ / รายงาน / AI Optimize / เครื่องมือ / ตั้งค่า
- [ ] 5.2 "เครื่องมือ" submenu collapses Events / Journey / Naming
- [ ] 5.3 "AI Optimize" links to a placeholder page until Phase C builds the feature

## 6. Specs
- [ ] 6.1 Write `openspec/specs/ui-design-system/spec.md` documenting the design system as a capability

## 7. Verify
- [ ] 7.1 Build passes
- [ ] 7.2 Storybook-style smoke route at `/dev/components` shows every primitive (dev-only, gated by NODE_ENV)
- [ ] 7.3 Existing pages still render (just with new shell) — no regression

## 8. Ship
- [ ] 8.1 Commit + push
- [ ] 8.2 Compare deployed shell with mockup, capture screenshots

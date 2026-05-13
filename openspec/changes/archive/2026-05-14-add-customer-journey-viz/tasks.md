# Tasks: add-customer-journey-viz (Phase 8)

## 8.1 — Data extraction
- [ ] `src/lib/journey/types.ts` — JourneyGraph, JourneyNode, JourneyEdge types
- [ ] `src/lib/journey/classify-url.ts` — domain → platform (WooCommerce / Shopify / WordPress / generic / unknown)
- [ ] `src/lib/journey/extract.ts` — main extractor:
  - Input: tenantId, scope (accounts + campaigns + date range)
  - Walk: campaign → ad → creative → post
  - Resolve link target via `object_story_spec.link_data.link` or `object_story_id` lookup
  - Build node set: campaign (optional), post, brand/landing, conversion goal
  - Build edges with flow volume = spend
- [ ] Cache 15 min per (tenantId, scope-hash, dateRange)

## 8.2 — API
- [ ] `GET /api/journey?tenantSlug=&campaignId=&range=&mode=overview|drilldown`
- [ ] Returns `JourneyGraph` JSON

## 8.3 — Page + canvas
- [ ] Install `@xyflow/react`, `dagre`
- [ ] `/t/<slug>/journey/page.tsx` server component (fetch initial graph)
- [ ] `<JourneyCanvas>` client component
  - Top bar: mode toggle [Overview / Drill-in], campaign picker, range picker
  - React Flow with fitView, minimap, controls
  - Background: sky gradient + animated dots (CSS)
- [ ] Empty state if no campaigns / no posts

## 8.4 — Custom nodes
- [ ] `<PostNode>` — thumbnail + caption snippet + reach chip
- [ ] `<BrandNode>` — circular icon (WooCommerce / Shopify / WordPress / 🌐)
- [ ] `<ConversionGoalNode>` — flag island, event name + count
- [ ] `<CampaignNode>` (Overview only) — folder card grouping
- [ ] Floating CSS animation on all nodes

## 8.5 — Animated edges
- [ ] `<AnimatedBeamEdge>` — SVG path with stroke-dasharray flowing dashes
- [ ] Direction always source → target
- [ ] Thickness = log(spend); color = funnel stage

## 8.6 — Auto-layout
- [ ] `src/lib/journey/layout.ts` — dagre LR (left-right) layout
- [ ] Re-run on filter change

## 8.7 — Detail drawer
- [ ] `<JourneyDetailDrawer>` — right slide-over
- [ ] Variants per node type
- [ ] "Open in Campaign Builder" / "Add to Knowledge" CTAs

## 8.8 — Game polish
- [ ] Snow / sky CSS background
- [ ] Floating idle animation
- [ ] Hover glow + scale
- [ ] Parallax dots layer

## 8.9 — Sidebar nav
- [ ] Add "Journey" item with Compass icon

## 8.10 — Test + deploy
- [ ] Smoke: extract a graph for demo tenant, verify nodes + edges
- [ ] Browser test: page renders, click node opens drawer, filter changes update graph
- [ ] Build + deploy

## Stretch (Phase 8.x — defer if needed)
- [ ] AI tool: `getJourneyForCampaign` so AI Master can reason about graph
- [ ] Export graph as PNG / share link
- [ ] Manual node positioning + save

# Phase 8 — Customer Journey Visualization

## Why

User's vision: a **game-like map** (Tower War / Hexapolis style) where each
"island" is a real Meta post / landing page / brand icon, and **animated
light beams** flow between them showing the user-journey direction.
The final island = conversion destination (Purchase / Lead) — all paths
converge there.

This is a major **differentiator** vs Madgicx / generic dashboard tools:
- Dashboards show numbers; we show the *story* of how spend → conversion.
- Visual debugging: "ทำไม campaign นี้ไม่ converte?" → ดูใน map ว่า user
  หลุดที่ node ไหน
- Sales pitch: เปิดให้ลูกค้าดูเอง "นี่คือ ad ตัวนี้ → คนกดเข้า → ดูหน้า
  → ซื้อ" — visceral

## What Changes

### 8.1 — Data extraction layer (`src/lib/journey/`)
- Walk down each tenant campaign → ad set → ad → creative → post
- Extract destination URL from `link_data.link` or `object_story_spec`
- Classify URL by platform (WooCommerce / Shopify / WordPress / generic / etc.)
- Map post → URL → Pixel events (from EventLog) → Custom Conversions
- Output: `JourneyGraph = { nodes: JourneyNode[], edges: JourneyEdge[] }`

### 8.2 — `/t/<slug>/journey` page (Hybrid mode)
- **Overview**: all campaigns in scope, nodes auto-cluster by destination
  (left = posts, middle = landing, right = conversion)
- **Drill-in**: filter by campaign → focused single-campaign graph
- Toggle in top bar: [Overview ⌂ | Drill-in 🎯] + date range filter
- React Flow canvas with custom nodes, animated edges, drag/zoom/fit

### 8.3 — Node types (custom React Flow components)
- **PostNode** — square island with actual post thumbnail + metrics chip
  (reach, CTR)
- **BrandNode** — circular island with brand icon (WooCommerce / Shopify /
  WordPress / generic 🌐)
- **ConversionGoalNode** — flag-on-island with event name + count
  ("PURCHASE × 26") — destination
- **CampaignNode** (only Overview) — folder-style grouping per campaign

### 8.4 — Animated beam edges
- Custom SVG edge with `stroke-dasharray` animation = flowing light dashes
- Direction = source → target (always)
- Thickness = log(flow volume) — bigger spend = thicker beam
- Color = funnel stage: awareness (blue) / consideration (purple) /
  conversion (green)

### 8.5 — Detail drawer
- Click any node → right slide-over drawer
- Post: thumbnail + metrics + "Open in Campaign Builder" link
- Brand/Landing: domain + pixel events fired here + "Add to Knowledge"
- Conversion goal: event details + linked Custom Conversion + recent fires

### 8.6 — Game polish
- Nodes have subtle `transform: translateY` floating animation (~3s loop)
- Sky/snow gradient background + parallax particles (CSS only — no library)
- Hover micro-interactions: scale 1.05 + glow
- Empty state: animated AdsLab mascot pointing to "Connect Meta first"

## Impact

**New files**:
- `src/lib/journey/extract.ts` — campaign → graph
- `src/lib/journey/classify-url.ts` — URL → platform
- `src/lib/journey/types.ts` — JourneyGraph, JourneyNode, JourneyEdge
- `src/app/api/journey/route.ts` — GET /api/journey
- `src/app/t/[tenantSlug]/journey/page.tsx`
- `src/components/tenant/journey-canvas.tsx` (main React Flow component)
- `src/components/tenant/journey-nodes/*.tsx` (PostNode, BrandNode,
  ConversionGoalNode, CampaignNode)
- `src/components/tenant/journey-edges/animated-beam-edge.tsx`

**New deps**:
- `@xyflow/react` (~80KB gz) — React Flow
- `dagre` (~40KB gz) — auto-layout
- `framer-motion` (already installed for some animations — confirm)

**Modified**:
- Sidebar — add "Journey" link
- (Optional) AI Master tool — `getJourneyForCampaign(id)` so AI can
  reason about the graph

## Risks

1. **Meta API rate limits** when fetching posts for many campaigns —
   batch + cache aggressively. 1 graph per (tenant, date-range, scope)
   cached 15min.
2. **Layout chaos** for 100+ campaigns — Overview cluster by destination
   + collapse low-spend nodes (top-20 by spend default).
3. **Performance** with 1000s of nodes — React Flow handles ~500 well;
   beyond that we paginate / sample.
4. **URL classification** is heuristic — false positives possible.
   Provide manual override later (Phase 8.5).

## Out of Scope (defer)

- Full 3D isometric (Pixi/Three) — DOM-based v1 is fast enough
- Drag to re-position nodes manually + save — would clutter MVP
- Cross-tenant journey (multi-BM aggregation)
- Audio / sound effects on conversion fire 🎵 — would be cool, defer
- Edit edges manually — defer

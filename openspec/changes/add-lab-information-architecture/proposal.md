## Why

The current sidebar exposes 13 top-level nav items plus a `/tools` page that is a hub-of-the-same-things (8 cards linking back to sidebar items). Users — including the founder, who runs 31 ad accounts daily — face a flat menu with weak grouping: "Boost", "Campaigns", "Ads" are 3 separate slots when they're all "launching/managing ads"; "AI Chat", "AI Optimize", "AI Memory" are 3 separate slots when they're all the same AI surface. The product name is **AdsLab** — leaning into the "Lab" metaphor lets us group related tools into 5 named **Labs**, each with internal tabs. Sidebar shrinks 13 → 6 (5 Labs + Settings), navigation becomes scannable in <2 seconds, and the `/tools` redundant hub goes away.

This composes with `add-isr-via-locale-url-prefix` (also active in `openspec/changes/`) — both change URLs, so executing them in the right order avoids touching the same routes twice. See design.md "Composition order".

## What Changes

- **BREAKING**: 5 new index routes (`/insights-lab`, `/launch-lab`, `/inventory-lab`, `/ai-lab`, `/automation-lab`) each rendering a tabbed container that contains the existing sub-pages.
- **BREAKING**: Top-level routes consolidated as sub-tabs of their parent Lab:
  - `/dashboard` → `/insights-lab` (default tab) + path `/insights-lab/overview`
  - `/reports`, `/reports/[id]` → `/insights-lab/reports`, `/insights-lab/reports/[id]`
  - `/journey` → `/insights-lab/journey`
  - `/competitors` → `/insights-lab/competitors`
  - `/boost` → `/launch-lab` (default tab) + path `/launch-lab/boost`
  - `/campaigns`, `/campaigns/new`, `/campaigns/ai-new`, `/campaigns/history` → `/launch-lab/campaigns`, `/launch-lab/manual-new`, `/launch-lab/ai-new`, `/launch-lab/history`
  - `/ads` → `/inventory-lab/ads`
  - `/audiences` → `/inventory-lab/audiences`
  - `/creatives` → `/inventory-lab/creatives`
  - `/posts`, `/posts/new` → `/inventory-lab/posts`, `/inventory-lab/posts/new`
  - `/ai` → `/ai-lab` (default tab Chat) + path `/ai-lab/chat`
  - `/ai-optimize` → `/ai-lab/recommendations`
  - `/ai/memory` → `/ai-lab/memory`
  - `/rules` → `/automation-lab` (default tab) + path `/automation-lab/rules`
  - `/goals`, `/goals/naming` → `/automation-lab/goals`, `/automation-lab/naming`
  - `/events` → `/automation-lab/events`
- **REMOVED**: `/tools` page deleted. Its 8 cards already point to sidebar items; redundant after the consolidation.
- **REMOVED**: `/g` and `/tt` (Google / TikTok placeholders) become "Coming Soon" empty Labs OR get folded into a future Launch Lab tab. Decide in design.md.
- Sidebar nav item array shrinks from 13 entries to 6: Insights Lab, Launch Lab, Inventory Lab, AI Lab, Automation Lab, Settings. Each gets a `FlaskConical` / `Rocket` / `Package` / `Brain` / `Workflow` / `Settings2` icon from lucide-react.
- Every Lab page gets a consistent header: page title + "Lab" badge + tab strip + description tooltip.
- The middleware adds 307 redirects from every legacy URL to its new Lab path for 90+ days (`/dashboard → /insights-lab/overview`, `/boost → /launch-lab/boost`, etc.) so existing bookmarks + email links keep working.

## Capabilities

### New Capabilities

(none — this is information-architecture restructuring, not new product capability)

### Modified Capabilities

- `i18n`: the `pages.<name>` namespaces re-key under the new Lab structure (e.g. `pages.dashboard.*` becomes `pages.insightsLab.overview.*`). Top-level `sidebar.nav` shrinks. The legacy-URL redirect requirement composes with the redirect requirement from `add-isr-via-locale-url-prefix`.
- `ui-design-system`: introduces "Lab page" as a first-class page pattern (header with badge + tab strip + content slot). Documented as a requirement so future Labs follow the pattern.

## Impact

- **Code**: ~27 page.tsx files relocate. 5 new Lab index pages + tab-strip component. Sidebar + mobile-nav rebuilt against the new 6-item array. ~250 internal `<Link>` call sites updated to new URLs (most are codemod-able as `find/replace` on path patterns).
- **i18n**: ~150 translation keys re-key under the new namespace tree. messages/*.json all three locales touched.
- **Sentry**: source map paths change → next deploy re-uploads sourcemaps (auto via `SENTRY_AUTH_TOKEN` already provisioned).
- **OpenSpec interaction**: must coordinate with `add-isr-via-locale-url-prefix`. Both proposals change URLs. The recommended order is to execute LOCALE-PREFIX FIRST (it scaffolds `[locale]` segment + middleware redirect infrastructure that this change reuses), then this Lab IA change is a much smaller delta on top. design.md spells out the composition.
- **External**: bookmarks, indexed search results, old email CTAs all 307-redirect transparently for 90+ days. Sitemap rebuilds.
- **Risk**: 250+ link sites + 150 i18n keys = high churn; mitigated by 90-day legacy redirect + Playwright smoke + codemod. ~1-2 days of focused work.

## MODIFIED Requirements

### Requirement: Language switcher in sidebar dropdown
The system SHALL surface a language switcher inside the user-profile dropdown menu at the sidebar bottom (alongside Profile / Settings / Logout). The sidebar's TOP section displays exactly six top-level Lab/Settings nav items (no more "Tools" hub, no more 13-item flat list). The switcher itself is unchanged in behavior; it still shows three options with the language's own name as label.

#### Scenario: Sidebar shows exactly six items
- **WHEN** a logged-in user opens the sidebar
- **THEN** the visible top-level items are: Insights Lab, Launch Lab, Inventory Lab, AI Lab, Automation Lab, Settings — in that order — each with its lucide icon. No "Tools", no "Dashboard", no "Reports" as separate items

#### Scenario: Active Lab highlights the right item
- **WHEN** the URL is `/insights-lab/journey`
- **THEN** the "Insights Lab" sidebar item shows the active style; clicking any sibling Lab navigates without losing the locale prefix

## ADDED Requirements

### Requirement: Lab pages compose sub-pages under a tab strip
Every Lab page SHALL render a consistent header containing: page title, "Lab" badge, tab strip pinned below the header, and a description tooltip explaining what the Lab is for. The tab strip exposes the Lab's sub-tabs as horizontal links; clicking a tab navigates to `/<lab>/<tab>` and the current tab gets the active style.

The five required Labs and their sub-tabs:

| Lab | URL | Default tab | Sub-tabs |
|---|---|---|---|
| Insights Lab | `/insights-lab` | overview | overview, reports, journey, competitors |
| Launch Lab | `/launch-lab` | boost | boost, campaigns, manual-new, ai-new, history |
| Inventory Lab | `/inventory-lab` | ads | ads, audiences, creatives, posts |
| AI Lab | `/ai-lab` | chat | chat, recommendations, memory |
| Automation Lab | `/automation-lab` | rules | rules, goals, naming, events |

#### Scenario: Lab landing renders default tab
- **WHEN** a user visits `/insights-lab` (no sub-tab in URL)
- **THEN** the page renders the Insights Lab header + tab strip with "Overview" active + the dashboard content from the previous standalone `/dashboard` route

#### Scenario: Tab navigation updates URL
- **WHEN** a user on `/insights-lab/overview` clicks the "Reports" tab
- **THEN** the URL becomes `/insights-lab/reports` and the tab strip shows "Reports" active without a full-page reload

#### Scenario: Direct sub-tab URL works
- **WHEN** a user clicks an email link to `/insights-lab/reports/abc123` (a specific report)
- **THEN** the page loads with Insights Lab header + Reports tab active + report content for ID `abc123`

### Requirement: Legacy top-level URLs 307-redirect to the Lab path
For at least 90 days after this change ships, the middleware SHALL serve a 307 redirect from every removed top-level URL to its new Lab path. This composes with the legacy-URL redirect already required by `add-isr-via-locale-url-prefix` — both redirects run in a single middleware pass.

Redirect map (legacy → new):

| Legacy | New |
|---|---|
| `/dashboard` | `/insights-lab/overview` |
| `/reports` | `/insights-lab/reports` |
| `/reports/[id]` | `/insights-lab/reports/[id]` |
| `/journey` | `/insights-lab/journey` |
| `/competitors` | `/insights-lab/competitors` |
| `/boost` | `/launch-lab/boost` |
| `/campaigns` | `/launch-lab/campaigns` |
| `/campaigns/new` | `/launch-lab/manual-new` |
| `/campaigns/ai-new` | `/launch-lab/ai-new` |
| `/campaigns/history` | `/launch-lab/history` |
| `/ads` | `/inventory-lab/ads` |
| `/audiences` | `/inventory-lab/audiences` |
| `/creatives` | `/inventory-lab/creatives` |
| `/posts`, `/posts/new` | `/inventory-lab/posts`, `/inventory-lab/posts/new` |
| `/ai` | `/ai-lab/chat` |
| `/ai/memory` | `/ai-lab/memory` |
| `/ai-optimize` | `/ai-lab/recommendations` |
| `/rules` | `/automation-lab/rules` |
| `/goals`, `/goals/naming` | `/automation-lab/goals`, `/automation-lab/naming` |
| `/events` | `/automation-lab/events` |
| `/tools` | `/insights-lab/overview` (no longer exists; redirect to dashboard) |

#### Scenario: Old bookmark to /dashboard
- **WHEN** a user with `adslab-locale=th` cookie visits `/dashboard` (or `/th/dashboard` after locale-prefix ships)
- **THEN** the response is 307 to `/th/insights-lab/overview` and the page loads as if the user had navigated there directly

#### Scenario: Old email CTA to /reports/xyz
- **WHEN** a user clicks `/reports/abc-123` from an email sent before this change
- **THEN** the response is 307 to `/<recipient-locale>/insights-lab/reports/abc-123`

### Requirement: i18n keys re-key under Lab namespaces
Translation keys under `pages.dashboard.*`, `pages.reports.*`, `pages.journey.*`, etc. SHALL migrate to `pages.insightsLab.overview.*`, `pages.insightsLab.reports.*`, `pages.insightsLab.journey.*` etc. The `audit-missing-keys-v3.py` script MUST report 0 missing keys at the end of the migration; the per-locale key tree drift MUST remain 0.

Old key paths MAY remain in the JSON dictionaries during a transition (no harm — they're orphan keys, not referenced by code). Phase 3 of the tasks deletes orphans.

#### Scenario: All references updated atomically
- **WHEN** running `npm run audit:i18n` after the i18n key re-key migration
- **THEN** "TRULY MISSING translation keys: 0" and "TH/EN/LO drift: 0 / 0 / 0" — no `t("oldKey")` references remain in code with no corresponding JSON value

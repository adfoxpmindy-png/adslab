## ADDED Requirements

### Requirement: Lab page pattern
The system SHALL provide a "Lab page" component pattern composed of:
1. A header block: page title, optional "Lab" badge (lucide `FlaskConical` or similar), 1-line subtitle / description tooltip.
2. A tab strip immediately under the header listing the Lab's sub-tabs as horizontal links. The active tab shows visual emphasis (filled background or underline). Tabs MUST be keyboard navigable (Tab + Enter) and screen-reader accessible (`role="tablist"`, `role="tab"`, `aria-selected`).
3. A content slot below the tab strip rendering the active sub-tab's content.

This pattern is reusable: future Labs (e.g., a future "Creative Lab" or "Tracking Lab") MUST use the same component, not roll their own.

The component lives at `src/components/ui-system/lab-page.tsx` and accepts props: `title`, `description?`, `icon`, `tabs: Array<{ key, labelKey, href }>`, `activeTab`, `children`.

#### Scenario: Tab strip is keyboard accessible
- **WHEN** a user focuses the first tab via Tab key
- **THEN** they can move between tabs with arrow keys (←/→), Enter activates the focused tab, the focus indicator is visible

#### Scenario: Mobile lab page collapses tab strip
- **WHEN** viewport width is below `sm` breakpoint (640px)
- **THEN** the tab strip becomes horizontally scrollable (no wrap) OR collapses into a dropdown — whichever the implementation chooses, the active tab MUST remain visible without horizontal scroll

### Requirement: Sidebar shows Lab structure, not flat list
The sidebar nav SHALL list exactly six items in this order: Insights Lab, Launch Lab, Inventory Lab, AI Lab, Automation Lab, Settings. The previous flat 13-item list is gone. Each item uses a distinct lucide icon to aid scannability:

| Sidebar item | Icon | Color hint |
|---|---|---|
| Insights Lab | `FlaskConical` | brand teal |
| Launch Lab | `Rocket` | brand violet |
| Inventory Lab | `Package` | brand cyan |
| AI Lab | `Brain` | brand pink |
| Automation Lab | `Workflow` | brand amber |
| Settings | `Settings2` | muted |

The mobile drawer mirrors the same six items + the same icons.

#### Scenario: First-time user can recall Lab purposes
- **WHEN** a non-technical user opens the sidebar for the first time
- **THEN** they can correctly guess where "see ROAS yesterday" lives (Insights), where "create a new ad" lives (Launch), where "chat with AI" lives (AI Lab) within 5 seconds — the icon + Thai label combination signals the function without requiring tooltip hover

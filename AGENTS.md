<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## URL + IA conventions (2026-05-20)

**URL shape**: every page lives under `/<locale>/...` where locale ∈ `th | en | lo`. The locale segment is enforced by `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`). Unprefixed URLs 307-redirect to the user's preferred locale.

**Tenant routes**: authenticated pages live at `/<locale>/t/<tenantSlug>/<section>/...`. The five sections are:

- `/insights` — Overview · Reports · Journey · Competitors
- `/launch` — Ads · Boost · Campaigns · New · AI Builder · History · Audiences · Creatives · Posts
- `/ai-lab` — Chat · Recommendations · Memory (**the only section that renders the "Lab" badge** — reserved for AI/exploratory tools)
- `/automation` — Rules · Goals · Naming · Events
- `/settings/*` — Integrations · Billing

Legacy URLs (`/dashboard`, `/boost`, `/ads`, ...) still work via 22 redirects in `proxy.ts:LAB_REDIRECTS`. New code should target the canonical section URLs above.

**Import primitives** (locale-aware navigation):

```ts
import { Link, useRouter, usePathname, redirect } from "@/i18n/routing";
```

Use these instead of `next/link` / `next/navigation` so links auto-prepend the active locale. Exception: `redirect` from server-side `lib/auth/*` stays on `next/navigation` because next-intl v4's redirect requires explicit `{href, locale}` and threading locale through every server function isn't worth it (the proxy handles the locale prefix anyway).

**LabPage shell**: `src/components/ui-system/lab-page.tsx`. Each section's `layout.tsx` instantiates it with `tabs={[...]}` and (only AI Lab) `showLabBadge`. Tab strip uses `usePathname` from `@/i18n/routing` so active highlighting works with locale-less paths.

**Email/OAuth absolute URLs**: any code building `${APP_URL}/...` for an email CTA or OAuth callback redirect MUST include the locale prefix (`${APP_URL}/${locale}/...`). Pattern: read `resolveUserLocale(userId)` once, prefix all redirects. Login-error redirects stay unprefixed because they happen before the user is known.

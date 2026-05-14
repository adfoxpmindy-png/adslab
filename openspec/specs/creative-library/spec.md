# Spec: Creative Library

**Capability:** Tenant-scoped storage and reuse of ad creatives (images + videos), backed by Vercel Blob, surfaced in `/creatives` and pickable from the Campaign Builder.

## Data Model

### `TenantCreative` (prisma/schema.prisma)

| Field | Type | Notes |
|-------|------|-------|
| `id` | cuid | Primary key |
| `tenantId` | FK Tenant | Cascade on tenant delete |
| `kind` | "image" \| "video" | Determines preview rendering + Meta upload path |
| `name` | string | Display name (defaults to original filename) |
| `url` | string | Public Vercel Blob URL |
| `pathname` | string | Blob pathname for delete |
| `contentType` | string | MIME type (e.g. `image/png`) |
| `sizeBytes` | int | For KPI display + sanity checks |
| `width` / `height` | int? | Optional, populated client-side or lazily |
| `source` | "upload" \| "ai-gen" | "ai-gen" flag for AI-generated assets |
| `metaImageHash` | string? | Cached Meta `image_hash` — populated on first use, reused on subsequent picks |
| `createdById` | string? | User who uploaded |
| `createdAt` | timestamp | |
| `deletedAt` | timestamp? | Soft delete |

Index: `(tenantId, deletedAt, createdAt)` — supports the library list query.

## Contract

### Upload — `POST /api/creatives/upload?tenantSlug=<slug>`

Roles: OWNER, MEDIA_BUYER.

Body: `multipart/form-data` with field `file` and optional `name`.

Validation:
- Size ≤ 10MB
- Content-Type ∈ `{image/png, image/jpeg, image/webp, image/gif, video/mp4, video/quicktime, video/webm}`

Behavior:
- Generate pathname `creatives/{tenantId}/{Date.now()}-{safeName}` so different tenants can't collide and same-name uploads don't overwrite
- Upload to Vercel Blob with `access: "public"` so the URL is directly servable in `<img src>`
- Insert `TenantCreative` row with `source: "upload"`

Responses:
- `200` → `{ ok: true, creativeId, url }`
- `400` → `{ error }` for size/type validation
- `400` → `{ error: "blob upload failed: ..." }` on Blob errors (e.g. token missing)

### List — `GET /api/creatives?tenantSlug=<slug>&kind=image|video&cursor=<id>&limit=<n>`

Roles: any member.

Query:
- `kind` (optional) — filter to image or video only
- `cursor` (optional) — pagination cursor (the `id` of the last item on the previous page)
- `limit` (optional, default 30, max 100)

Returns: `{ items: TenantCreative[], nextCursor: string | null }` — `nextCursor` is null when no more pages.

### Delete — `DELETE /api/creatives/{id}?tenantSlug=<slug>`

Roles: OWNER, MEDIA_BUYER.

Behavior:
- Verifies tenant ownership (404 if not in tenant)
- Calls `del(url)` on Vercel Blob (best-effort — logs but doesn't fail if blob already gone)
- Sets `deletedAt = now()` (soft delete — preserves audit trail of what was used in past ads)

Responses:
- `200` → `{ ok: true }`
- `404` → if creative not in tenant or already deleted

### Meta image hash — `POST /api/creatives/{id}/meta-hash?tenantSlug=<slug>&metaAccountId=act_xxx`

Roles: OWNER, MEDIA_BUYER. Only meaningful for `kind: "image"` creatives.

Behavior:
- **Hot path:** if `metaImageHash` is already set on the row, return it immediately with `cached: true`
- **Cold path:** fetch the blob URL → re-upload to Meta via `POST /{adAccountId}/adimages` → persist returned hash on the row → return with `cached: false`

Responses:
- `200` → `{ hash, url, cached }`
- `400` → `{ error: "only image creatives can be uploaded as ad image" }` for video
- `404` → if creative not in tenant
- `502` → on Meta API failure (e.g. image rejected for dimensions/format)

## Frontend

### `/creatives` page

- 4 KPI cards (image / video / AI-gen / total) populated from `countCreatives()`
- Filter pills: ทั้งหมด / ภาพ / วิดีโอ (client-side filter over the already-loaded items)
- Search input: client-side substring match on `name`
- Drag-drop upload modal supporting multiple files with per-file progress
- Grid is responsive: 2 cols mobile → 5 cols desktop
- Delete button overlay on hover (OWNER/MEDIA_BUYER only)
- Pagination: "โหลดเพิ่ม" button uses `nextCursor` from API

### Campaign Builder integration

Third creative source: `"from_library"` pill alongside `"new_image"` + `"existing_post"`.

When selected:
- Renders a "เลือกจากคลัง" button that opens `<LibraryPicker />`
- Picker shows tenant's image creatives in a grid
- On pick: calls `/meta-hash` endpoint to prepare for Meta → sets `imageHash` + `imagePreviewUrl` in form state
- Submit payload reuses the same `new_image` creative shape (no schema change to `/api/meta/campaigns/create`)

## Storage & Cost

- Vercel Blob `public` access — public URL is fine for ad creatives (they get pushed to Meta's CDN anyway)
- Pricing: $0.30/GB stored, $0.05/GB transfer at MVP scale
- The 10MB-per-file cap keeps cost predictable; users can't accidentally upload multi-GB raw video

## Operational Requirements

- `BLOB_READ_WRITE_TOKEN` must be set on the Vercel project — auto-injected when a Blob store is connected via `vercel blob create-store --access public --yes` or via the dashboard's Storage tab

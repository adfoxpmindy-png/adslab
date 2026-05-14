/**
 * Tenant creative library — server-side service.
 *
 * Uses Vercel Blob for storage. Requires BLOB_READ_WRITE_TOKEN env var
 * (auto-injected by Vercel when Blob is enabled on the project).
 */
import { put, del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export type CreativeKind = "image" | "video";

export type UploadInput = {
  tenantId: string;
  file: File;
  name?: string;
  source?: "upload" | "ai-gen";
  createdById?: string;
};

export type UploadResult =
  | { ok: true; creativeId: string; url: string }
  | { ok: false; error: string };

export async function uploadCreative(input: UploadInput): Promise<UploadResult> {
  const { file, tenantId } = input;

  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: `ไฟล์ใหญ่เกินไป (เกิน ${MAX_SIZE_BYTES / 1024 / 1024}MB)` };
  }

  let kind: CreativeKind;
  if (ALLOWED_IMAGE.has(file.type)) kind = "image";
  else if (ALLOWED_VIDEO.has(file.type)) kind = "video";
  else return { ok: false, error: `ประเภทไฟล์ไม่รองรับ: ${file.type}` };

  // Path includes tenantId so different tenants can't collide; random
  // suffix prevents same-name uploads from overwriting each other.
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const pathname = `creatives/${tenantId}/${Date.now()}-${safeName}`;

  let blob;
  try {
    blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false, // we already include Date.now()
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `blob upload failed: ${msg}` };
  }

  // Best-effort image dimensions: only available client-side typically.
  // We'll store nulls and let the UI compute them on display.

  const creative = await prisma.tenantCreative.create({
    data: {
      tenantId,
      kind,
      name: input.name ?? file.name,
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      sizeBytes: file.size,
      source: input.source ?? "upload",
      createdById: input.createdById ?? null,
    },
    select: { id: true, url: true },
  });

  return { ok: true, creativeId: creative.id, url: creative.url };
}

export async function listCreatives(args: {
  tenantId: string;
  kind?: CreativeKind;
  limit?: number;
  cursor?: string;
}) {
  const items = await prisma.tenantCreative.findMany({
    where: {
      tenantId: args.tenantId,
      deletedAt: null,
      ...(args.kind ? { kind: args.kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: (args.limit ?? 30) + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      kind: true,
      name: true,
      url: true,
      contentType: true,
      sizeBytes: true,
      width: true,
      height: true,
      source: true,
      metaImageHash: true,
      createdAt: true,
    },
  });

  const hasMore = items.length > (args.limit ?? 30);
  const data = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { items: data, nextCursor };
}

export async function deleteCreative(args: {
  tenantId: string;
  creativeId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const creative = await prisma.tenantCreative.findFirst({
    where: { id: args.creativeId, tenantId: args.tenantId, deletedAt: null },
    select: { id: true, pathname: true, url: true },
  });
  if (!creative) return { ok: false, error: "creative not found" };

  // Try to delete from blob storage first. If that fails (e.g. already
  // gone), still soft-delete the DB row.
  try {
    await del(creative.url);
  } catch (err) {
    console.warn("[creatives/delete] blob del failed:", (err as Error).message);
  }

  await prisma.tenantCreative.update({
    where: { id: creative.id },
    data: { deletedAt: new Date() },
  });

  return { ok: true };
}

/** Count by kind — used for the KPI cards on /creatives page. */
export async function countCreatives(tenantId: string) {
  const grouped = await prisma.tenantCreative.groupBy({
    by: ["kind"],
    where: { tenantId, deletedAt: null },
    _count: { _all: true },
  });
  const counts = { image: 0, video: 0, aiGen: 0 };
  for (const g of grouped) {
    if (g.kind === "image") counts.image = g._count._all;
    if (g.kind === "video") counts.video = g._count._all;
  }
  const aiGen = await prisma.tenantCreative.count({
    where: { tenantId, deletedAt: null, source: "ai-gen" },
  });
  counts.aiGen = aiGen;
  return counts;
}

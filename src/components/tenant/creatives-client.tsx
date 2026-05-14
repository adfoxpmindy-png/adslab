"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Search, Trash2, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { BrandButton, EmptyState } from "@/components/ui-system";
import { cn } from "@/lib/utils";

export type CreativeListItem = {
  id: string;
  kind: "image" | "video";
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  source: string;
  createdAt: string;
};

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  initialItems: CreativeListItem[];
  initialNextCursor: string | null;
};

export function CreativesClient({
  tenantSlug,
  canEdit,
  initialItems,
  initialNextCursor,
}: Props) {
  const [items, setItems] = useState<CreativeListItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video">("all");
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const filtered = items.filter((it) => {
    if (kindFilter !== "all" && it.kind !== kindFilter) return false;
    if (query && !it.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ tenantSlug, cursor: nextCursor });
      const res = await fetch(`/api/creatives?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: CreativeListItem[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      toast.error(`โหลดเพิ่มไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, tenantSlug]);

  const onUploaded = useCallback((newItem: CreativeListItem) => {
    setItems((prev) => [newItem, ...prev]);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("ลบ creative นี้? Ad ที่ใช้อยู่จะยังคงอยู่ใน Meta")) return;
      try {
        const res = await fetch(
          `/api/creatives/${id}?tenantSlug=${encodeURIComponent(tenantSlug)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        setItems((prev) => prev.filter((it) => it.id !== id));
        toast.success("ลบแล้ว");
      } catch (err) {
        toast.error(`ลบไม่สำเร็จ: ${(err as Error).message}`);
      }
    },
    [tenantSlug],
  );

  return (
    <>
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาตามชื่อ..."
            className="pl-9"
          />
        </div>
        <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-card">
          {[
            { value: "all" as const, label: "ทั้งหมด" },
            { value: "image" as const, label: "ภาพ" },
            { value: "video" as const, label: "วิดีโอ" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setKindFilter(opt.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                kindFilter === opt.value
                  ? "bg-brand-gradient text-white shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {canEdit && (
          <BrandButton onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            อัปโหลด
          </BrandButton>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={ImagePlus}
          title={items.length === 0 ? "ยังไม่มี creative ในคลัง" : "ไม่พบ creative ที่ตรงเงื่อนไข"}
          description={
            items.length === 0
              ? "อัปโหลดรูป/วิดีโอเพื่อใช้ในแคมเปญ — Campaign Builder จะดึงจากคลังนี้ได้เลย"
              : "ลองล้างฟิลเตอร์หรืออัปโหลดใหม่"
          }
          action={
            canEdit ? (
              <BrandButton onClick={() => setUploadOpen(true)} size="lg">
                <Upload className="size-4" />
                อัปโหลด
              </BrandButton>
            ) : null
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((it) => (
              <CreativeCard
                key={it.id}
                item={it}
                canDelete={canEdit}
                onDelete={() => handleDelete(it.id)}
              />
            ))}
          </div>
          {nextCursor && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                โหลดเพิ่ม
              </button>
            </div>
          )}
        </>
      )}

      {uploadOpen && (
        <UploadModal
          tenantSlug={tenantSlug}
          onClose={() => setUploadOpen(false)}
          onUploaded={onUploaded}
        />
      )}
    </>
  );
}

function CreativeCard({
  item,
  canDelete,
  onDelete,
}: {
  item: CreativeListItem;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="aspect-square w-full bg-muted">
        {item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid size-full place-items-center bg-muted">
            <Video className="size-10 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="truncate text-xs font-medium" title={item.name}>
          {item.name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {(item.sizeBytes / 1024).toFixed(0)} KB
          {item.source === "ai-gen" && " · AI"}
        </p>
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="ลบ"
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function UploadModal({
  tenantSlug,
  onClose,
  onUploaded,
}: {
  tenantSlug: string;
  onClose: () => void;
  onUploaded: (item: CreativeListItem) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setProgress({ done: 0, total: files.length });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await fetch(
            `/api/creatives/upload?tenantSlug=${encodeURIComponent(tenantSlug)}`,
            { method: "POST", body: form },
          );
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
          const data = (await res.json()) as { creativeId: string; url: string };
          // Construct optimistic list item — server has real width/height
          // but we don't need them for the grid.
          onUploaded({
            id: data.creativeId,
            kind: file.type.startsWith("video/") ? "video" : "image",
            name: file.name,
            url: data.url,
            contentType: file.type,
            sizeBytes: file.size,
            width: null,
            height: null,
            source: "upload",
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ: ${(err as Error).message}`);
        }
        setProgress({ done: i + 1, total: files.length });
      }

      setUploading(false);
      setProgress(null);
      onClose();
      toast.success(`อัปโหลด ${files.length} ไฟล์เสร็จแล้ว`);
    },
    [tenantSlug, onUploaded, onClose],
  );

  return (
    <>
      <div
        aria-hidden
        onClick={uploading ? undefined : onClose}
        className="fixed inset-0 z-50 bg-black/60"
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">อัปโหลด creative</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              รองรับ jpg, png, webp, gif, mp4 (สูงสุด 10MB ต่อไฟล์)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="ปิด"
            className="-mr-2 -mt-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-5 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="size-8 animate-spin text-violet-600" />
              <p className="text-sm font-medium">
                กำลังอัปโหลด {progress?.done ?? 0} / {progress?.total ?? 0}
              </p>
            </>
          ) : (
            <>
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">เลือกไฟล์ (เลือกได้หลายไฟล์)</p>
              <p className="text-[11px] text-muted-foreground">
                หรือลากวางที่นี่ได้
              </p>
            </>
          )}
        </button>
      </div>
    </>
  );
}

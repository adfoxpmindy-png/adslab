"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import type { CreativeListItem } from "./creatives-client";

type Props = {
  tenantSlug: string;
  metaAccountId: string;
  open: boolean;
  onClose: () => void;
  /** Called when the user picks a creative AND we've prepared the Meta hash. */
  onPicked: (args: { creativeId: string; url: string; hash: string }) => void;
};

/**
 * Modal that lists tenant image creatives + on pick, fetches the Meta
 * `image_hash` for use in ad creation. Hash is cached on the creative
 * row so subsequent picks of the same item skip the Meta upload.
 */
export function LibraryPicker({ tenantSlug, metaAccountId, open, onClose, onPicked }: Props) {
  const [items, setItems] = useState<CreativeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ tenantSlug, kind: "image", limit: "60" });
    fetch(`/api/creatives?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { items: CreativeListItem[] };
      })
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(`โหลดคลังไม่สำเร็จ: ${(err as Error).message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantSlug]);

  async function handlePick(item: CreativeListItem) {
    setPreparing(item.id);
    try {
      const params = new URLSearchParams({ tenantSlug, metaAccountId });
      const res = await fetch(
        `/api/creatives/${item.id}/meta-hash?${params.toString()}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { hash: string; url: string; cached: boolean };
      onPicked({ creativeId: item.id, url: data.url, hash: data.hash });
      onClose();
    } catch (err) {
      toast.error(`เตรียมรูปไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      setPreparing(null);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={preparing ? undefined : onClose}
        className="fixed inset-0 z-50 bg-black/60"
      />
      <div className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">เลือกจากคลัง creative</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              เลือก image creative ที่อัปโหลดไว้ — ระบบจะส่งให้ Meta อัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={preparing !== null}
            aria-label="ปิด"
            className="-mr-2 -mt-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              กำลังโหลด...
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <ImageIcon className="size-10 text-muted-foreground" />
              <p className="text-sm font-medium">คลังว่างเปล่า</p>
              <p className="text-xs text-muted-foreground">
                อัปโหลด creative ก่อนที่หน้า &quot;ครีเอทีฟ&quot;
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  disabled={preparing !== null}
                  onClick={() => handlePick(it)}
                  className="group relative overflow-hidden rounded-xl border border-border bg-muted transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-card disabled:opacity-50"
                >
                  <div className="aspect-square w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.url}
                      alt={it.name}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="truncate px-2 py-1.5 text-left text-[11px] font-medium" title={it.name}>
                    {it.name}
                  </p>
                  {preparing === it.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                      <Loader2 className="size-5 animate-spin" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

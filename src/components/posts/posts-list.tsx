"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, AlertTriangle, XCircle, Trash2, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/i18n/format";

export type PostRow = {
  id: string;
  metaPageId: string;
  pageName: string;
  pagePictureUrl: string | null;
  caption: string;
  mediaUrls: string[];
  postKind: "PHOTO" | "ALBUM" | "VIDEO";
  scheduledAt: string;
  status: "PENDING" | "SCHEDULED" | "PUBLISHED" | "CANCELLED" | "FAILED";
  metaPostId: string | null;
  errorMessage: string | null;
};

type Props = {
  tenantSlug: string;
  rows: PostRow[];
  canEdit: boolean;
};

function StatusBadge({
  status,
  tStatus,
}: {
  status: PostRow["status"];
  tStatus: (k: string) => string;
}) {
  switch (status) {
    case "SCHEDULED":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
          <Clock className="size-3" /> {tStatus("scheduled")}
        </span>
      );
    case "PUBLISHED":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-3" /> {tStatus("published")}
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> {tStatus("pending")}
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="size-3" /> {tStatus("failed")}
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <XCircle className="size-3" /> {tStatus("cancelled")}
        </span>
      );
  }
}

export function PostsList({ tenantSlug, rows, canEdit }: Props) {
  const router = useRouter();
  const tPosts = useTranslations("posts");
  const tStatus = useTranslations("posts.status");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Set<string>>(new Set());

  function fmtDateTime(iso: string): string {
    return formatDateTime(iso, locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      year: undefined,
    });
  }

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center">
        <p className="text-sm font-medium">{tPosts("empty")}</p>
        <p className="text-xs text-muted-foreground">{tPosts("emptyHint")}</p>
      </Card>
    );
  }

  async function cancel(id: string) {
    if (!confirm(tPosts("cancelConfirm"))) return;
    setBusy((prev) => new Set(prev).add(id));
    const toastId = toast.loading(tPosts("cancelLoading"));
    try {
      const r = await fetch(`/api/posts/${id}/cancel?tenantSlug=${tenantSlug}`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? tCommon("failed"));
      toast.success(tPosts("cancelSuccess"), { id: toastId });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tCommon("failed"), { id: toastId });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((p) => {
        const isBusy = busy.has(p.id);
        const canCancel = canEdit && p.status === "SCHEDULED";
        return (
          <Card key={p.id} className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              <div className="shrink-0">
                {p.mediaUrls[0] && p.postKind !== "VIDEO" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.mediaUrls[0]}
                    alt=""
                    className="size-20 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex size-20 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">
                    {p.postKind === "VIDEO" ? "🎬" : p.postKind}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={p.status} tStatus={tStatus} />
                  <span className="text-[11px] text-muted-foreground">
                    {p.pageName}
                  </span>
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDateTime(p.scheduledAt)}
                  </span>
                  {p.mediaUrls.length > 1 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      +{p.mediaUrls.length - 1}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "line-clamp-3 text-sm",
                    p.status === "CANCELLED" && "text-muted-foreground line-through",
                  )}
                >
                  {p.caption}
                </p>
                {p.errorMessage && (
                  <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300">
                    ⚠ {p.errorMessage}
                  </p>
                )}
              </div>
              {canCancel && (
                <div className="shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => cancel(p.id)}
                    className="gap-1.5 text-rose-600 dark:text-rose-300"
                  >
                    <Trash2 className="size-3.5" />
                    {tPosts("cancelBtn")}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

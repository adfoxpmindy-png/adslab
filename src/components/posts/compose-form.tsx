"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Calendar, Loader2, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PageOption = {
  metaPageId: string;
  name: string;
  pictureUrl: string | null;
};

type MediaItem = {
  url: string;
  contentType: string;
  isVideo: boolean;
  name: string;
};

type Props = {
  tenantSlug: string;
  pages: PageOption[];
};

const MAX_CAPTION = 5000;

function defaultScheduledAtIso(): string {
  // Tomorrow 18:00 Bangkok = 11:00 UTC tomorrow. Convert to local datetime-input format.
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(11, 0, 0, 0);
  // datetime-local needs YYYY-MM-DDTHH:MM in local timezone.
  const local = new Date(t.getTime() - t.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ComposeForm({ tenantSlug, pages }: Props) {
  const router = useRouter();
  const t = useTranslations("posts.compose");
  const tCommon = useTranslations("common");
  const [pageId, setPageId] = useState<string>(pages[0]?.metaPageId ?? "");
  const [caption, setCaption] = useState<string>("");
  const [scheduledAtLocal, setScheduledAtLocal] = useState<string>(defaultScheduledAtIso());
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (pages.length === 0) {
    return (
      <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("noPagesEmpty")}
      </Card>
    );
  }

  const hasVideo = media.some((m) => m.isVideo);
  const canAddMore = !hasVideo && media.length < 10;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newItems: MediaItem[] = [];
      for (const file of Array.from(files)) {
        const isVid = file.type.startsWith("video/");
        if (isVid && media.length > 0) {
          toast.error(t("videoOnlyOne"));
          continue;
        }
        if (hasVideo) {
          toast.error(t("videoExists"));
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/posts/upload?tenantSlug=${tenantSlug}`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(`${file.name}: ${data.error ?? "upload failed"}`);
          continue;
        }
        newItems.push({
          url: data.url,
          contentType: data.contentType,
          isVideo: isVid,
          name: file.name,
        });
      }
      setMedia((prev) => [...prev, ...newItems]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeMedia(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!pageId) return toast.error(t("errPickPage"));
    if (caption.trim().length === 0) return toast.error(t("errEmptyCaption"));
    if (media.length === 0) return toast.error(t("errEmptyMedia"));
    const scheduledAt = new Date(scheduledAtLocal);
    if (Number.isNaN(scheduledAt.getTime())) return toast.error(t("errSchedule"));
    if (scheduledAt.getTime() - Date.now() < 10 * 60_000) {
      return toast.error(t("errLeadTime"));
    }

    setSubmitting(true);
    const toastId = toast.loading(t("loading"));
    try {
      const res = await fetch(`/api/posts/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          metaPageId: pageId,
          caption,
          mediaUrls: media.map((m) => m.url),
          scheduledAt: scheduledAt.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("errSchedule"));
      toast.success(t("success"), { id: toastId });
      startTransition(() => router.push(`/t/${tenantSlug}/posts`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tCommon("failed"), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <div className="space-y-2">
        <Label htmlFor="page-picker">{t("pageLabel")}</Label>
        <select
          id="page-picker"
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {pages.map((p) => (
            <option key={p.metaPageId} value={p.metaPageId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>{t("mediaLabel")}</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {media.map((m, idx) => (
            <div key={idx} className="group relative">
              {m.isVideo ? (
                <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Video className="size-6" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.name} className="aspect-square w-full rounded-md object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeMedia(idx)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md border-2 border-dashed text-muted-foreground hover:bg-muted/50",
                uploading && "opacity-50",
              )}
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <p className="text-[11px] text-muted-foreground">
          {hasVideo ? t("videoUploaded") : t("mediaHint")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="caption">{t("captionLabel")}</Label>
        <textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={MAX_CAPTION}
          rows={6}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder={t("captionPlaceholder")}
        />
        <p className="text-right text-[11px] text-muted-foreground">
          {caption.length} / {MAX_CAPTION}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Calendar className="size-3.5" />
          {t("scheduleLabel")}
        </Label>
        <DatePicker
          value={scheduledAtLocal}
          onChange={(next) => setScheduledAtLocal(next)}
          showTime
        />
        <p className="text-[11px] text-muted-foreground">{t("scheduleHint")}</p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" disabled={submitting || uploading} onClick={submit}>
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          {t("submit")}
        </Button>
      </div>
    </Card>
  );
}

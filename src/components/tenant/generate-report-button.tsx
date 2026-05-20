"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const PROGRESS_KEYS = [
  "fetching",
  "analyzingAccounts",
  "thinking",
  "writing",
  "almostDone",
] as const;

export function GenerateReportButton({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("pages.reports.generate");
  const tProgress = useTranslations("pages.reports.generate.progress");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const progressMessages = useMemo(
    () => PROGRESS_KEYS.map((k) => tProgress(k)),
    [tProgress],
  );

  // Cycle through progress messages while generating.
  useEffect(() => {
    if (!pending) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset progress index when generation stops
      setProgressIdx(0);
      return;
    }
    intervalRef.current = setInterval(() => {
      setProgressIdx((i) => Math.min(i + 1, progressMessages.length - 1));
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pending, progressMessages.length]);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    const toastId = toast.loading(progressMessages[0], { duration: 60_000 });

    let toastIdx = 0;
    const toastInterval = setInterval(() => {
      toastIdx = Math.min(toastIdx + 1, progressMessages.length - 1);
      toast.loading(progressMessages[toastIdx], { id: toastId, duration: 60_000 });
    }, 4000);

    try {
      const res = await fetch(`/api/reports/generate?tenantSlug=${tenantSlug}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("failed"));

      clearInterval(toastInterval);
      // Override the loading toast's original 60s duration so the bubble
      // dismisses normally after navigation. Without this, success/info
      // sticks around for the full minute.
      if (data.status === "skipped") {
        toast.info(t("skipped"), { id: toastId, duration: 2500 });
      } else if (data.status === "completed") {
        toast.success(t("success"), { id: toastId, duration: 3000 });
      }
      router.push(`/t/${tenantSlug}/reports/${data.reportId}`);
      router.refresh();
    } catch (err) {
      clearInterval(toastInterval);
      toast.error(err instanceof Error ? err.message : t("failed"), {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={pending} className="gap-2 min-w-[220px]">
      <Sparkles className={pending ? "size-4 animate-pulse" : "size-4"} />
      <span className="truncate">
        {pending ? progressMessages[progressIdx] : t("button")}
      </span>
    </Button>
  );
}

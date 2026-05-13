"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const PROGRESS_MESSAGES = [
  "📊 กำลังดึงข้อมูลจาก Meta...",
  "🔍 วิเคราะห์ ad accounts...",
  "🤖 Claude กำลังคิด...",
  "✍️ เขียนรายงานเป็นภาษาไทย...",
  "✨ เกือบเสร็จแล้ว...",
];

export function GenerateReportButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle through progress messages while generating.
  useEffect(() => {
    if (!pending) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setProgressIdx(0);
      return;
    }
    intervalRef.current = setInterval(() => {
      setProgressIdx((i) => Math.min(i + 1, PROGRESS_MESSAGES.length - 1));
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pending]);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    const toastId = toast.loading(PROGRESS_MESSAGES[0], { duration: 60_000 });

    let toastIdx = 0;
    const toastInterval = setInterval(() => {
      toastIdx = Math.min(toastIdx + 1, PROGRESS_MESSAGES.length - 1);
      toast.loading(PROGRESS_MESSAGES[toastIdx], { id: toastId, duration: 60_000 });
    }, 4000);

    try {
      const res = await fetch(`/api/reports/generate?tenantSlug=${tenantSlug}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "สร้างรายงานไม่สำเร็จ");

      clearInterval(toastInterval);
      // Override the loading toast's original 60s duration so the bubble
      // dismisses normally after navigation. Without this, success/info
      // sticks around for the full minute.
      if (data.status === "skipped") {
        toast.info("มีรายงานของวันนี้อยู่แล้ว — กำลังพาไปดู", { id: toastId, duration: 2500 });
      } else if (data.status === "completed") {
        toast.success("✓ สร้างรายงานสำเร็จ", { id: toastId, duration: 3000 });
      }
      router.push(`/t/${tenantSlug}/reports/${data.reportId}`);
      router.refresh();
    } catch (err) {
      clearInterval(toastInterval);
      toast.error(err instanceof Error ? err.message : "สร้างรายงานไม่สำเร็จ", {
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
        {pending ? PROGRESS_MESSAGES[progressIdx] : "สร้างรายงานเดี๋ยวนี้"}
      </span>
    </Button>
  );
}

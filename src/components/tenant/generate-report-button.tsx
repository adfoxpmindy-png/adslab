"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function GenerateReportButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/reports/generate?tenantSlug=${tenantSlug}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "สร้างรายงานไม่สำเร็จ");

      if (data.status === "skipped") {
        toast.info("มีรายงานของวันนี้อยู่แล้ว");
      } else if (data.status === "completed") {
        toast.success("สร้างรายงานสำเร็จ");
      }
      router.push(`/t/${tenantSlug}/reports/${data.reportId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างรายงานไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={pending} className="gap-2">
      <Sparkles className="size-4" />
      {pending ? "กำลังสร้าง..." : "สร้างรายงานเดี๋ยวนี้"}
    </Button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type AddOnKey = "event-sdk" | "white-label" | "priority-ai";

type Props = {
  tenantSlug: string;
  currentAddOns: string[];
  cancelAtPeriodEnd: boolean;
  planKey: string;
};

export function BillingActions({ tenantSlug, currentAddOns, cancelAtPeriodEnd, planKey }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyAddon, setBusyAddon] = useState<AddOnKey | null>(null);
  const isScalePlus = planKey === "scale" || planKey === "enterprise";

  async function toggleAddon(key: AddOnKey) {
    const action = currentAddOns.includes(key) ? "remove" : "add";
    setBusyAddon(key);
    try {
      const res = await fetch("/api/billing/addon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantSlug, action, addOnKey: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "ดำเนินการไม่สำเร็จ");
        return;
      }
      toast.success(action === "add" ? "เปิด add-on แล้ว" : "ปิด add-on แล้ว");
      router.refresh();
    } finally {
      setBusyAddon(null);
    }
  }

  function handleCancel() {
    if (!confirm("ยืนยันยกเลิกการสมัคร? คุณยังใช้งานได้จนถึงสิ้นรอบบิลปัจจุบัน")) return;
    startTransition(async () => {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantSlug }),
      });
      if (!res.ok) {
        toast.error("ยกเลิกไม่สำเร็จ");
        return;
      }
      toast.success("ยกเลิกการสมัครเรียบร้อย");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap gap-2">
        {(["event-sdk", "white-label", "priority-ai"] as const).map((k) => {
          if (k === "white-label" && isScalePlus) return null;
          const active = currentAddOns.includes(k);
          const labels: Record<AddOnKey, string> = {
            "event-sdk": "Event SDK",
            "white-label": "White-label",
            "priority-ai": "Priority AI",
          };
          return (
            <Button
              key={k}
              variant={active ? "secondary" : "outline"}
              size="sm"
              disabled={busyAddon === k}
              onClick={() => toggleAddon(k)}
            >
              {busyAddon === k ? "..." : (active ? `ปิด ${labels[k]}` : `เปิด ${labels[k]}`)}
            </Button>
          );
        })}
      </div>
      <div className="ml-auto">
        {!cancelAtPeriodEnd && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={handleCancel}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            ยกเลิกการสมัคร
          </Button>
        )}
      </div>
    </div>
  );
}

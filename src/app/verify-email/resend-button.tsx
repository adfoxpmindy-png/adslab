"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ResendButton() {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ kind: "error", text: data.error ?? "ส่งเมลใหม่ไม่สำเร็จ" });
      } else {
        setFeedback({
          kind: "ok",
          text: "ส่งเมลใหม่เรียบร้อย กรุณาตรวจสอบกล่องจดหมาย",
        });
      }
    } catch {
      setFeedback({ kind: "error", text: "เชื่อมต่อ server ไม่ได้" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleClick} disabled={pending} variant="outline" className="w-full">
        {pending ? "กำลังส่ง..." : "ส่งเมลยืนยันใหม่"}
      </Button>
      {feedback && (
        <p
          className={
            feedback.kind === "ok"
              ? "text-center text-sm text-emerald-600"
              : "text-center text-sm text-destructive"
          }
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

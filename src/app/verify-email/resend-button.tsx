"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function ResendButton() {
  const t = useTranslations("pages.verifyEmail.resend");
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
        setFeedback({ kind: "error", text: data.error ?? t("failedMsg") });
      } else {
        setFeedback({
          kind: "ok",
          text: t("successMsg"),
        });
      }
    } catch {
      setFeedback({ kind: "error", text: t("connectionError") });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleClick} disabled={pending} variant="outline" className="w-full">
        {pending ? t("sending") : t("send")}
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

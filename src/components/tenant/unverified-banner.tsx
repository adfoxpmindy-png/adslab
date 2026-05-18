"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function UnverifiedBanner() {
  const t = useTranslations("banners.unverified");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleResend() {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      setFeedback(res.ok ? t("resendSuccess") : data.error ?? t("resendFailed"));
    } catch {
      setFeedback(t("connectionError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-2.5 text-sm">
        <MailWarning className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="flex-1 text-amber-900 dark:text-amber-100">
          {feedback ?? t("message")}
        </p>
        {!feedback && (
          <Button
            variant="ghost"
            size="xs"
            onClick={handleResend}
            disabled={pending}
            className="text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            {pending ? t("sending") : t("resend")}
          </Button>
        )}
      </div>
    </div>
  );
}

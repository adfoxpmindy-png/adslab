"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Platform = "google" | "tiktok";

const PLATFORM_STYLES: Record<Platform, { iconBg: string; iconText: string }> = {
  google: { iconBg: "bg-blue-500/10", iconText: "text-blue-600" },
  tiktok: { iconBg: "bg-rose-500/10", iconText: "text-rose-600" },
};

export function ComingSoonCard({
  platform,
  tenantSlug,
  title,
  description,
}: {
  platform: Platform;
  tenantSlug?: string;
  title: string;
  description: string;
}) {
  const t = useTranslations("comingSoon");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const styles = PLATFORM_STYLES[platform];

  async function submit() {
    if (!email.trim()) {
      toast.error(t("emailRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          platform,
          tenantSlug,
          source: "settings",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("submitFailed"));
      setSubmitted(true);
      toast.success(t("registered"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-start gap-3">
        <div
          className={`flex size-9 items-center justify-center rounded-md ${styles.iconBg}`}
        >
          <PlatformIcon platform={platform} className={`size-5 ${styles.iconText}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              {t("badge")}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>

      <Card className="p-5">
        {submitted ? (
          <div className="flex items-center gap-2 text-sm">
            <div className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Check className="size-3" strokeWidth={3} />
            </div>
            <span>
              {t("registeredInline")} <span className="font-medium">{email}</span> — {t("willNotifyWhenReady", { title })}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              {t("promptLabel", { title })}
            </label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={submitting}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={submit}
                disabled={submitting || !email.trim()}
              >
                {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {t("submit")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className: string;
}) {
  if (platform === "google") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.55a8.16 8.16 0 0 0 4.77 1.52V6.69h-1.84z" />
    </svg>
  );
}

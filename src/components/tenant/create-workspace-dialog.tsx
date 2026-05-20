"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type UseCase = "own" | "client" | "test";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal that creates a new tenant workspace for the current user. Two
 * fields: name (required, 2-64 chars) and an optional use-case radio for
 * future onboarding personalization. The use-case isn't persisted yet
 * (Tenant has no metadata column) — it's collected so we can route
 * personalized onboarding later without breaking the UI when we do.
 *
 * On submit:
 *   POST /api/tenants { name } → { ok, tenant: { slug } }
 *   → router.push(`/${locale}/t/${slug}/insights`)
 *   → tenant layout's requireActiveSubscription redirects to
 *     /setup-billing?tenant=<slug> for the trial flow.
 */
export function CreateWorkspaceDialog({ open, onClose }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("tenantSwitcher.create");
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function reset() {
    setName("");
    setUseCase(null);
    setNameError(null);
  }

  function close() {
    if (pending) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setNameError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError(t("nameTooShort"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.fieldErrors?.name) setNameError(data.fieldErrors.name);
          else toast.error(data.error ?? t("genericError"));
          return;
        }
        toast.success(t("success", { name: data.tenant.name }));
        reset();
        onClose();
        // Navigate to the new workspace. Tenant layout will redirect to
        // setup-billing on first load because no subscription exists yet.
        router.push(`/${locale}/t/${data.tenant.slug}/insights`);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message || t("genericError"));
      }
    });
  }

  const useCaseOptions: { value: UseCase; label: string }[] = [
    { value: "own", label: t("useCase.own") },
    { value: "client", label: t("useCase.client") },
    { value: "test", label: t("useCase.test") },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-5 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="create-workspace-title" className="text-lg font-semibold tracking-tight">
              {t("title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("close")}
            disabled={pending}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">{t("nameLabel")}</Label>
            <Input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoFocus
              maxLength={64}
              disabled={pending}
              aria-invalid={nameError ? "true" : undefined}
              aria-describedby={nameError ? "workspace-name-error" : undefined}
            />
            {nameError && (
              <p id="workspace-name-error" className="text-xs text-rose-600 dark:text-rose-400">
                {nameError}
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("useCaseLabel")}</legend>
            <p className="text-xs text-muted-foreground">{t("useCaseHint")}</p>
            <div className="space-y-1.5">
              {useCaseOptions.map((opt) => {
                const checked = useCase === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent",
                      checked && "border-primary bg-primary/5",
                      pending && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="useCase"
                      value={opt.value}
                      checked={checked}
                      onChange={() => setUseCase(opt.value)}
                      disabled={pending}
                      className="size-3.5"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {t("submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

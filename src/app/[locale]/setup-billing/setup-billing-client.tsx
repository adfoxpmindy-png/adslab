"use client";

import Script from "next/script";
import { useRouter } from "@/i18n/routing";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, CreditCard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

type PlanKey = "starter" | "growth" | "pro" | "scale";

type PlanOption = {
  key: PlanKey;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  bulletKeys: readonly string[];
  recommended?: boolean;
};

const PLANS: PlanOption[] = [
  {
    key: "starter",
    name: "Starter",
    priceMonthly: 1490,
    priceYearly: 14990,
    bulletKeys: ["adAccounts", "aiMessages", "dashboard", "customerJourney"],
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthly: 3890,
    priceYearly: 38990,
    bulletKeys: ["adAccounts", "aiMessages", "allStarter", "customConversions"],
    recommended: true,
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 10_990,
    priceYearly: 109_990,
    bulletKeys: ["adAccounts", "aiMessages", "allGrowth", "audienceManagement"],
  },
  {
    key: "scale",
    name: "Scale",
    priceMonthly: 44_990,
    priceYearly: 449_990,
    bulletKeys: ["adAccounts", "aiUnlimited", "whiteLabel", "prioritySupport"],
  },
];

declare global {
  interface Window {
    Omise?: {
      setPublicKey(key: string): void;
      createToken(
        type: "card",
        data: {
          name: string;
          number: string;
          expiration_month: number;
          expiration_year: number;
          security_code: string;
        },
        callback: (status: number, response: { id?: string; message?: string }) => void,
      ): void;
    };
  }
}

export function SetupBillingClient({
  tenantSlug,
  tenantName,
  publicKey,
}: {
  tenantSlug: string;
  tenantName: string;
  publicKey: string;
}) {
  const t = useTranslations("pages.setupBilling");
  const locale = useLocale();
  const router = useRouter();
  const [planKey, setPlanKey] = useState<PlanKey>("growth");
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [cardName, setCardName] = useState(tenantName);
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const selected = PLANS.find((p) => p.key === planKey)!;
  const price = interval === "MONTHLY" ? selected.priceMonthly : selected.priceYearly;
  const periodLabel = interval === "MONTHLY" ? t("month") : t("year");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!window.Omise) {
      setError(t("errors.omiseNotLoaded"));
      return;
    }
    if (!publicKey) {
      setError(t("errors.noPaymentKey"));
      return;
    }
    if (!acceptedTerms) {
      setError(t("errors.mustAcceptTerms"));
      return;
    }
    setPending(true);

    window.Omise.setPublicKey(publicKey);
    window.Omise.createToken(
      "card",
      {
        name: cardName,
        number: cardNumber.replace(/\s/g, ""),
        expiration_month: parseInt(expMonth, 10),
        expiration_year: parseInt(expYear, 10),
        security_code: cvv,
      },
      async (status, response) => {
        if (status !== 200 || !response.id) {
          setError(response.message ?? t("errors.invalidCard"));
          setPending(false);
          return;
        }
        try {
          const res = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tenantSlug,
              planKey,
              interval,
              addOnKeys: [],
              extraAdAccounts: 0,
              cardToken: response.id,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message ?? data.error ?? t("errors.generic"));
            setPending(false);
            return;
          }
          router.push(`/t/${tenantSlug}/insights?welcome=1`);
        } catch (err) {
          setError((err as Error).message);
          setPending(false);
        }
      },
    );
  }

  return (
    <>
      <Script
        src="https://cdn.omise.co/omise.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      {/* Plan picker */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => {
          const isSelected = p.key === planKey;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPlanKey(p.key)}
              className={cn(
                "relative rounded-xl border-2 p-4 text-left transition-all",
                isSelected
                  ? "border-cyan-500 bg-cyan-50/40 dark:bg-cyan-950/20"
                  : "border-border bg-card hover:border-cyan-300",
              )}
            >
              {p.recommended && (
                <span className="absolute -top-2 left-3 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {t("recommended")}
                </span>
              )}
              <div className="text-lg font-bold">{p.name}</div>
              <div className="mt-1 text-2xl font-extrabold tracking-tight">
                ฿{formatNumber(interval === "MONTHLY" ? p.priceMonthly : p.priceYearly, locale)}
                <span className="text-xs font-normal text-muted-foreground">
                  /{interval === "MONTHLY" ? t("month") : t("year")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t(`plans.${p.key}.description`)}</p>
              <ul className="mt-3 space-y-1.5">
                {p.bulletKeys.map((bk) => (
                  <li key={bk} className="flex items-start gap-1.5 text-xs">
                    <Check className="size-3 shrink-0 text-cyan-600" />
                    <span>{t(`plans.${p.key}.bullets.${bk}` as Parameters<typeof t>[0])}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Yearly toggle */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setInterval("MONTHLY")}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm",
            interval === "MONTHLY"
              ? "bg-foreground text-background"
              : "text-muted-foreground",
          )}
        >
          {t("monthlyToggle")}
        </button>
        <button
          type="button"
          onClick={() => setInterval("YEARLY")}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm",
            interval === "YEARLY"
              ? "bg-foreground text-background"
              : "text-muted-foreground",
          )}
        >
          {t("yearlyToggle")} <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">{t("yearlySavings")}</span>
        </button>
      </div>

      {/* Card form */}
      <form onSubmit={handleSubmit} className="mt-10 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <CreditCard className="size-5 text-cyan-600" />
          <h2 className="text-lg font-semibold">{t("cardForm.heading")}</h2>
        </div>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="cardName">{t("cardForm.cardName")}</Label>
            <Input
              id="cardName"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              required
              autoComplete="cc-name"
            />
          </div>
          <div>
            <Label htmlFor="cardNumber">{t("cardForm.cardNumber")}</Label>
            <Input
              id="cardNumber"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              required
              inputMode="numeric"
              maxLength={19}
              placeholder="4242 4242 4242 4242"
              autoComplete="cc-number"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="expMonth">{t("cardForm.expMonth")}</Label>
              <Input
                id="expMonth"
                value={expMonth}
                onChange={(e) => setExpMonth(e.target.value)}
                required
                inputMode="numeric"
                maxLength={2}
                placeholder="MM"
                autoComplete="cc-exp-month"
              />
            </div>
            <div>
              <Label htmlFor="expYear">{t("cardForm.expYear")}</Label>
              <Input
                id="expYear"
                value={expYear}
                onChange={(e) => setExpYear(e.target.value)}
                required
                inputMode="numeric"
                maxLength={4}
                placeholder="YYYY"
                autoComplete="cc-exp-year"
              />
            </div>
            <div>
              <Label htmlFor="cvv">{t("cardForm.cvv")}</Label>
              <Input
                id="cvv"
                value={cvv}
                onChange={(e) => setCvv(e.target.value)}
                required
                inputMode="numeric"
                maxLength={4}
                placeholder="123"
                autoComplete="cc-csc"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        )}

        {/* Required by Omise KYC: refund + terms acceptance must be
            shown *before* the payment button, not just linked elsewhere. */}
        <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input text-cyan-600 focus:ring-cyan-500"
            />
            <span className="text-xs leading-relaxed text-foreground">
              {t("terms.iAccept")}{" "}
              <a href="/terms" target="_blank" className="font-medium text-cyan-600 underline-offset-2 hover:underline">
                {t("terms.tos")}
              </a>{" "}
              {t("terms.and")}{" "}
              <a href="/refund-policy" target="_blank" className="font-medium text-cyan-600 underline-offset-2 hover:underline">
                {t("terms.refundPolicy")}
              </a>{" "}
              {t("terms.adsLab")}
              <br />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {t("terms.bullet1")}<br />
                {t("terms.bullet2")}<br />
                {t("terms.bullet3")}<br />
                {t("terms.bullet4")}
              </span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-5">
          <div>
            <p className="text-xs text-muted-foreground">{t("summary.totalPerPeriod")}</p>
            <p className="text-xl font-bold">
              ฿{formatNumber(price, locale)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                /{periodLabel}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("summary.trialNote")}
            </p>
          </div>
          <Button type="submit" size="lg" disabled={pending || !scriptReady || !acceptedTerms}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t("submit.saving")}
              </>
            ) : (
              t("submit.startTrial")
            )}
          </Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {t("footerNote")}
        </p>
      </form>
    </>
  );
}

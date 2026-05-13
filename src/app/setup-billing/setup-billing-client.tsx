"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CreditCard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PlanOption = {
  key: "starter" | "growth" | "pro" | "scale";
  name: string;
  priceMonthly: number;
  priceYearly: number;
  description: string;
  bullets: string[];
  recommended?: boolean;
};

const PLANS: PlanOption[] = [
  {
    key: "starter",
    name: "Starter",
    priceMonthly: 1490,
    priceYearly: 14990,
    description: "เหมาะกับมือใหม่ ad spend < ฿10,000/เดือน",
    bullets: ["1 ad account", "30 AI message/วัน", "Dashboard + AI Master", "Customer Journey"],
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthly: 3890,
    priceYearly: 38990,
    description: "ad spend ฿10k–฿30k/เดือน",
    bullets: ["3 ad accounts", "100 AI message/วัน", "ทุกฟีเจอร์ของ Starter", "Custom Conversions"],
    recommended: true,
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 10_990,
    priceYearly: 109_990,
    description: "ad spend ฿30k–฿100k/เดือน",
    bullets: ["10 ad accounts", "300 AI message/วัน", "ทุกฟีเจอร์ของ Growth", "Audience Management"],
  },
  {
    key: "scale",
    name: "Scale",
    priceMonthly: 44_990,
    priceYearly: 449_990,
    description: "ad spend ฿100k–฿500k/เดือน",
    bullets: ["25 ad accounts", "AI ไม่จำกัด", "White-label Reports ฟรี", "Priority Support"],
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
  const router = useRouter();
  const [planKey, setPlanKey] = useState<PlanOption["key"]>("growth");
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [cardName, setCardName] = useState(tenantName);
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const selected = PLANS.find((p) => p.key === planKey)!;
  const price = interval === "MONTHLY" ? selected.priceMonthly : selected.priceYearly;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!window.Omise) {
      setError("Omise script ยังไม่โหลด");
      return;
    }
    if (!publicKey) {
      setError("ระบบยังไม่ตั้งค่าการชำระเงิน — ติดต่อทีมงาน");
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
          setError(response.message ?? "บัตรเครดิตไม่ถูกต้อง");
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
            setError(data.message ?? data.error ?? "เกิดข้อผิดพลาด");
            setPending(false);
            return;
          }
          router.push(`/t/${tenantSlug}/dashboard?welcome=1`);
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
                  แนะนำ
                </span>
              )}
              <div className="text-lg font-bold">{p.name}</div>
              <div className="mt-1 text-2xl font-extrabold tracking-tight">
                ฿{(interval === "MONTHLY" ? p.priceMonthly : p.priceYearly).toLocaleString("th-TH")}
                <span className="text-xs font-normal text-muted-foreground">
                  /{interval === "MONTHLY" ? "เดือน" : "ปี"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>
              <ul className="mt-3 space-y-1.5">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-1.5 text-xs">
                    <Check className="size-3 shrink-0 text-cyan-600" />
                    <span>{b}</span>
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
          รายเดือน
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
          รายปี <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">−17%</span>
        </button>
      </div>

      {/* Card form */}
      <form onSubmit={handleSubmit} className="mt-10 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <CreditCard className="size-5 text-cyan-600" />
          <h2 className="text-lg font-semibold">ข้อมูลบัตรเครดิต</h2>
        </div>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="cardName">ชื่อบนบัตร</Label>
            <Input
              id="cardName"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              required
              autoComplete="cc-name"
            />
          </div>
          <div>
            <Label htmlFor="cardNumber">หมายเลขบัตร</Label>
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
              <Label htmlFor="expMonth">เดือน</Label>
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
              <Label htmlFor="expYear">ปี (4 หลัก)</Label>
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
              <Label htmlFor="cvv">CVV</Label>
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

        <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
          <div>
            <p className="text-xs text-muted-foreground">รวมต่อรอบบิล (VAT รวมแล้ว)</p>
            <p className="text-xl font-bold">
              ฿{price.toLocaleString("th-TH")}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                /{interval === "MONTHLY" ? "เดือน" : "ปี"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ทดลองใช้ฟรี 7 วัน • เริ่มเก็บเงินหลังครบ
            </p>
          </div>
          <Button type="submit" size="lg" disabled={pending || !scriptReady}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> กำลังบันทึก
              </>
            ) : (
              "เริ่มทดลองใช้ฟรี 7 วัน"
            )}
          </Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          ระบบชำระเงินผ่าน Omise (ปลอดภัย PCI DSS Level 1)
        </p>
      </form>
    </>
  );
}

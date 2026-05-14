import { CheckCircle2, AlertCircle, Clock } from "lucide-react";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getPlan, type PlanKey } from "@/lib/billing/plans";
import { splitVat } from "@/lib/billing/tier-rules";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

import { BillingActions } from "./billing-actions";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);

  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
    include: { plan: true },
  });
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  if (!subscription) {
    // Shouldn't happen — gate would have redirected to /setup-billing.
    return <p className="text-muted-foreground">ไม่พบข้อมูลการสมัคร</p>;
  }

  const plan = subscription.plan;
  const planDef = getPlan(plan.key as PlanKey);
  const periodPrice =
    subscription.interval === "MONTHLY"
      ? plan.priceMonthly
      : plan.priceYearly;

  const statusLabel: Record<typeof subscription.status, { label: string; color: string; icon: React.ElementType }> = {
    TRIALING: { label: "กำลังทดลองใช้", color: "text-cyan-700 bg-cyan-50 dark:bg-cyan-950/30 dark:text-cyan-300", icon: Clock },
    ACTIVE: { label: "ใช้งานอยู่", color: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300", icon: CheckCircle2 },
    PAST_DUE: { label: "ค้างชำระ", color: "text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300", icon: AlertCircle },
    SUSPENDED: { label: "ถูกระงับ", color: "text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300", icon: AlertCircle },
    CANCELLED: { label: "ยกเลิกแล้ว", color: "text-muted-foreground bg-muted", icon: AlertCircle },
  };
  const sLabel = statusLabel[subscription.status];
  const Icon = sLabel.icon;

  return (
    <>
      <SetPageTitle
        title="การเรียกเก็บเงิน"
        subtitle="ดูแผนปัจจุบัน + ประวัติการชำระเงิน + จัดการ subscription"
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
      {/* Current plan card */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">แพ็กเกจปัจจุบัน</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{plan.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ฿{periodPrice.toLocaleString("th-TH")} / {subscription.interval === "MONTHLY" ? "เดือน" : "ปี"} (VAT รวมแล้ว)
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${sLabel.color}`}>
            <Icon className="size-3" />
            {sLabel.label}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Ad accounts</dt>
            <dd className="mt-0.5 font-medium">
              {planDef.adAccountLimit + subscription.extraAdAccounts}
              {subscription.extraAdAccounts > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({planDef.adAccountLimit} + {subscription.extraAdAccounts} extra)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">AI message/วัน</dt>
            <dd className="mt-0.5 font-medium">
              {planDef.aiMsgPerDay ?? "ไม่จำกัด"}
            </dd>
          </div>
          {subscription.status === "TRIALING" && subscription.trialEndsAt && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">ทดลองใช้จนถึง</dt>
              <dd className="mt-0.5 font-medium">
                {new Date(subscription.trialEndsAt).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
              </dd>
            </div>
          )}
          {subscription.status === "ACTIVE" && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">รอบบิลถัดไป</dt>
              <dd className="mt-0.5 font-medium">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                {subscription.cancelAtPeriodEnd && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    จะยกเลิกในวันนี้
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>

        {/* Add-ons */}
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold">Add-ons</h3>
          <ul className="grid gap-2 text-sm">
            {(["event-sdk", "white-label", "priority-ai"] as const).map((k) => {
              const a = getPlan(k);
              const active = subscription.addOnKeys.includes(k);
              const freeFromPlan = k === "white-label" && (plan.key === "scale" || plan.key === "enterprise");
              return (
                <li key={k} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ฿{a.priceMonthly.toLocaleString("th-TH")}/เดือน
                      {freeFromPlan && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">รวมในแผน</span>}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                    active || freeFromPlan
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {active || freeFromPlan ? "เปิดอยู่" : "ปิดอยู่"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {role === "OWNER" && subscription.status !== "CANCELLED" && (
          <BillingActions
            tenantSlug={tenantSlug}
            currentAddOns={subscription.addOnKeys}
            cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
            planKey={plan.key}
          />
        )}
      </section>

      {/* Invoices */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">ประวัติการชำระเงิน</h3>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีรายการ</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 font-medium">วันที่</th>
                <th className="pb-2 font-medium">จำนวนเงิน</th>
                <th className="pb-2 font-medium">สถานะ</th>
                <th className="pb-2 font-medium">VAT</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const { base, vat } = splitVat(inv.amount);
                return (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="py-2.5">
                      {new Date(inv.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-2.5 font-medium tabular-nums">
                      ฿{inv.amount.toLocaleString("th-TH")}
                    </td>
                    <td className="py-2.5">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      ฿{base.toLocaleString("th-TH")} + ฿{vat.toLocaleString("th-TH")} VAT
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      </div>
    </>
  );
}

function InvoiceStatusBadge({ status }: { status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" }) {
  const styles: Record<typeof status, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    PAID: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-red-100 text-red-800",
    REFUNDED: "bg-blue-100 text-blue-800",
  };
  const labels: Record<typeof status, string> = {
    PENDING: "รอชำระ",
    PAID: "ชำระแล้ว",
    FAILED: "ไม่สำเร็จ",
    REFUNDED: "คืนเงินแล้ว",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

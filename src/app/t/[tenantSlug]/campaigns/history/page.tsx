import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { getEffectiveScope } from "@/lib/tenant-scope";

const PAGE_SIZE = 30;

const ACTION_LABEL: Record<string, string> = {
  PAUSE: "Pause",
  RESUME: "Resume",
  SET_BUDGET: "แก้ Budget",
  SET_END_DATE: "แก้ End Date",
};

const RESULT_STYLE: Record<string, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  FAILED: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

function formatValue(action: string, value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const v = value as Record<string, unknown>;
  if (action === "SET_BUDGET") {
    const daily = v.dailyBudget as number | null;
    const lifetime = v.lifetimeBudget as number | null;
    if (daily) return `Daily ฿${(daily / 100).toLocaleString("th-TH")}`;
    if (lifetime) return `Lifetime ฿${(lifetime / 100).toLocaleString("th-TH")}`;
    return "—";
  }
  if (action === "SET_END_DATE") {
    return v.endTime ? new Date(v.endTime as string).toLocaleString("th-TH") : "—";
  }
  return JSON.stringify(v);
}

export default async function CampaignHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    page?: string;
    action?: string;
    result?: string;
    userId?: string;
  }>;
}) {
  const { tenantSlug } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  const scope = await getEffectiveScope(session.userId, tenant.id);

  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const where: Record<string, unknown> = { tenantId: tenant.id };
  if (sp.action && sp.action !== "ALL") where.action = sp.action;
  if (sp.result && sp.result !== "ALL") where.result = sp.result;
  if (sp.userId && sp.userId !== "ALL") where.userId = sp.userId;

  // Scope filter: action logs reference metaCampaignId (Meta's id) — we
  // hide logs for campaigns outside the effective scope so users don't
  // see noise from accounts they've focused away from.
  if (scope.campaignIds !== null) {
    where.metaCampaignId = { in: scope.campaignIds };
  } else if (scope.accountIds !== null) {
    // No explicit campaign filter but account scope active — derive the
    // set of campaigns under those accounts and filter by that. We look
    // up via metaConnectionId because MetaConnection is unique per
    // tenant (no FK to Tenant directly on MetaCampaign).
    const tenantConnection = await prisma.metaConnection.findUnique({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    if (tenantConnection) {
      const inScopeCampaigns = await prisma.metaCampaign.findMany({
        where: {
          metaConnectionId: tenantConnection.id,
          metaAccountId: { in: scope.accountIds },
        },
        select: { metaCampaignId: true },
      });
      where.metaCampaignId = {
        in: inScopeCampaigns.map((c) => c.metaCampaignId),
      };
    } else {
      where.metaCampaignId = { in: [] };
    }
  }

  const [total, logs, users] = await Promise.all([
    prisma.campaignActionLog.count({ where }),
    prisma.campaignActionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.tenantMember.findMany({
      where: { tenantId: tenant.id },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const userIds = logs.map((l) => l.userId);
  const campaignIds = logs.map((l) => l.campaignId);

  const [usersInfo, campaignsInfo] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    }),
    prisma.metaCampaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true },
    }),
  ]);
  const userById = new Map(usersInfo.map((u) => [u.id, u.name]));
  const campaignById = new Map(campaignsInfo.map((c) => [c.id, c.name]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: Record<string, string | undefined>) {
    const next = { ...sp, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && v !== "ALL") qs.set(k, String(v));
    }
    const q = qs.toString();
    return `/t/${tenantSlug}/campaigns/history${q ? `?${q}` : ""}`;
  }

  return (
    <>
      <SetPageTitle
        title="ประวัติ Action"
        subtitle="ทุก action ที่ทำผ่าน AdsLab — ใคร / เมื่อไหร่ / กับ campaign ไหน / before → after"
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <Link
          href={`/t/${tenantSlug}/campaigns`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          กลับไปหน้า Campaigns
        </Link>

        {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Filter
        </span>
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <select
            name="action"
            defaultValue={sp.action ?? "ALL"}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="ALL">ทุก action</option>
            <option value="PAUSE">Pause</option>
            <option value="RESUME">Resume</option>
            <option value="SET_BUDGET">SET_BUDGET</option>
            <option value="SET_END_DATE">SET_END_DATE</option>
          </select>
          <select
            name="result"
            defaultValue={sp.result ?? "ALL"}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="ALL">ทุกผลลัพธ์</option>
            <option value="SUCCESS">สำเร็จ</option>
            <option value="FAILED">ล้มเหลว</option>
          </select>
          <select
            name="userId"
            defaultValue={sp.userId ?? "ALL"}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="ALL">ทุก user</option>
            {users.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            กรอง
          </button>
          {(sp.action || sp.result || sp.userId) && (
            <Link
              href={`/t/${tenantSlug}/campaigns/history`}
              className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
            >
              ล้าง
            </Link>
          )}
        </form>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {total} รายการ
        </span>
      </div>

      {/* Log table */}
      {logs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center">
          <p className="text-sm font-medium">ยังไม่มีประวัติ action</p>
          <p className="text-xs text-muted-foreground">
            กด Pause/Resume หรือแก้ budget ในหน้า Campaigns เพื่อสร้าง audit log แรก
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {logs.map((l) => {
              const userName = userById.get(l.userId) ?? "—";
              const campaignName = campaignById.get(l.campaignId) ?? `(deleted: ${l.metaCampaignId})`;
              const resultStyle = RESULT_STYLE[l.result] ?? "";
              const actionLabel = ACTION_LABEL[l.action] ?? l.action;
              const before =
                l.action === "PAUSE" || l.action === "RESUME"
                  ? l.beforeStatus
                  : formatValue(l.action, l.beforeValue);
              const after =
                l.action === "PAUSE" || l.action === "RESUME"
                  ? l.afterStatus
                  : formatValue(l.action, l.afterValue);
              return (
                <div key={l.id} className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[180px_120px_1fr_auto]">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {l.createdAt.toLocaleString("th-TH")}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{actionLabel}</span>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium", resultStyle)}>
                      {l.result === "SUCCESS" ? "OK" : "FAIL"}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium" title={campaignName}>
                      {campaignName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium">{userName}</span>: {before ?? "—"} → {after ?? "—"}
                    </p>
                    {l.errorMessage && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-300">
                        ⚠ {l.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm">
            {page > 1 && (
              <Link
                href={buildHref({ page: String(page - 1) })}
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
              >
                ก่อนหน้า
              </Link>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              หน้า {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
              >
                ถัดไป
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}

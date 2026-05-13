"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Plus, Search, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PROGRESS_MESSAGES = [
  "📊 กำลังดึงข้อมูลจาก Meta...",
  "🔍 วิเคราะห์ campaigns...",
  "🤖 Claude กำลังคิด...",
  "✍️ เขียนรายงานเป็นภาษาไทย...",
  "✨ เกือบเสร็จแล้ว...",
];

type Scope = {
  id: string;
  name: string;
  accountIds: string[];
  campaignIds: string[];
};

type Account = { id: string; name: string; business: string | null };
type Campaign = { id: string; accountId: string; name: string; status: string };
type ReportRow = {
  id: string;
  reportDate: string;
  status: string;
  previewText: string;
  generatedAt: string;
  deliveredAt: string | null;
  estimatedCostUsd: number;
};

type Props = {
  tenantSlug: string;
  canGenerate: boolean;
  scopes: Scope[];
  selectedScopeId: string | null;
  selectedScopeName: string | null;
  accounts: Account[];
  campaigns: Campaign[];
  reports: ReportRow[];
  statusLabels: Record<string, { label: string; tone: string }>;
};

export function ReportsClient({
  tenantSlug,
  canGenerate,
  scopes,
  selectedScopeId,
  accounts,
  campaigns,
  reports,
  statusLabels,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [scopeModalOpen, setScopeModalOpen] = useState<"create" | { edit: Scope } | null>(null);
  const [generating, setGenerating] = useState(false);

  function changeScope(newId: string | null) {
    const url = newId
      ? `/t/${tenantSlug}/reports?scopeId=${newId}`
      : `/t/${tenantSlug}/reports`;
    router.push(url);
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    const toastId = toast.loading(PROGRESS_MESSAGES[0], { duration: 120_000 });
    let idx = 0;
    const interval = setInterval(() => {
      idx = Math.min(idx + 1, PROGRESS_MESSAGES.length - 1);
      toast.loading(PROGRESS_MESSAGES[idx], { id: toastId, duration: 120_000 });
    }, 4000);

    try {
      const qs = new URLSearchParams({ tenantSlug });
      if (selectedScopeId) qs.set("scopeId", selectedScopeId);
      const res = await fetch(`/api/reports/generate?${qs.toString()}`, { method: "POST" });
      const data = await res.json();
      clearInterval(interval);
      if (!res.ok) throw new Error(data.error ?? "สร้างรายงานไม่สำเร็จ");

      if (data.status === "skipped") {
        toast.info("มีรายงานของวันนี้อยู่แล้ว — กำลังพาไปดู", { id: toastId, duration: 2500 });
      } else {
        toast.success("✓ สร้างรายงานสำเร็จ", { id: toastId, duration: 3000 });
      }
      router.push(`/t/${tenantSlug}/reports/${data.reportId}`);
      router.refresh();
    } catch (err) {
      clearInterval(interval);
      toast.error(err instanceof Error ? err.message : "สร้างรายงานไม่สำเร็จ", {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setGenerating(false);
    }
  }

  async function deleteScope(scope: Scope) {
    if (!confirm(`ลบ scope "${scope.name}"? (รายงานเก่าจะยังอยู่)`)) return;
    try {
      const res = await fetch(`/api/scopes?tenantSlug=${tenantSlug}&id=${scope.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("✓ ลบ scope แล้ว");
      // If we were viewing the deleted scope, fall back to "All".
      if (selectedScopeId === scope.id) {
        router.push(`/t/${tenantSlug}/reports`);
      }
      startTransition(() => router.refresh());
    } catch {
      toast.error("ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-4">
      {/* Scope toolbar — single horizontal row, wraps on narrow screens */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Scope
        </span>
        <select
          value={selectedScopeId ?? ""}
          onChange={(e) => changeScope(e.target.value || null)}
          className="h-8 max-w-[240px] rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">ทั้งหมด (default)</option>
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {canGenerate && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setScopeModalOpen("create")}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              สร้างใหม่
            </Button>
            {selectedScopeId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const s = scopes.find((x) => x.id === selectedScopeId);
                    if (s) setScopeModalOpen({ edit: s });
                  }}
                  className="gap-1.5"
                  title="แก้ไข scope นี้"
                >
                  <Settings2 className="size-3.5" />
                  แก้ไข
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => {
                    const s = scopes.find((x) => x.id === selectedScopeId);
                    if (s) deleteScope(s);
                  }}
                  className="text-destructive"
                  title="ลบ scope นี้"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </>
        )}

        {canGenerate && (
          <Button
            onClick={handleGenerate}
            disabled={generating}
            size="sm"
            className="ml-auto gap-2"
          >
            <Sparkles className={cn("size-3.5", generating && "animate-pulse")} />
            <span className="truncate max-w-[260px]">
              {generating
                ? PROGRESS_MESSAGES[0]
                : selectedScopeId
                  ? "สร้างรายงาน scope นี้"
                  : "สร้างรายงานเดี๋ยวนี้"}
            </span>
          </Button>
        )}
      </div>

      {/* Report list */}
      {reports.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-16 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {selectedScopeId
              ? "ยังไม่มีรายงานสำหรับ scope นี้"
              : "ยังไม่มีรายงาน"}
          </p>
          <p className="text-xs text-muted-foreground">
            คลิก &quot;สร้างรายงาน&quot; เพื่อให้ AI สรุปข้อมูลของเมื่อวานให้คุณ
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {reports.map((r) => {
              const status = statusLabels[r.status] ?? statusLabels.GENERATING;
              return (
                <li key={r.id}>
                  <Link
                    href={`/t/${tenantSlug}/reports/${r.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{r.reportDate}</span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            status.tone,
                          )}
                        >
                          {status.label}
                        </span>
                        {r.deliveredAt && (
                          <span className="text-[11px] text-muted-foreground">ส่งอีเมลแล้ว</span>
                        )}
                      </div>
                      {r.previewText && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {r.previewText}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
                      <span>{new Date(r.generatedAt).toLocaleString("th-TH")}</span>
                      {r.estimatedCostUsd > 0 && (
                        <span>${r.estimatedCostUsd.toFixed(4)}</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {scopeModalOpen && (
        <ScopeModal
          tenantSlug={tenantSlug}
          accounts={accounts}
          campaigns={campaigns}
          editing={typeof scopeModalOpen === "object" ? scopeModalOpen.edit : null}
          onClose={() => setScopeModalOpen(null)}
          onSaved={(savedId) => {
            setScopeModalOpen(null);
            router.push(`/t/${tenantSlug}/reports?scopeId=${savedId}`);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Scope create/edit modal
// =============================================================================

function ScopeModal({
  tenantSlug,
  accounts,
  campaigns,
  editing,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  accounts: Account[];
  campaigns: Campaign[];
  editing: Scope | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [accountIds, setAccountIds] = useState<Set<string>>(
    new Set(editing?.accountIds ?? []),
  );
  const [campaignIds, setCampaignIds] = useState<Set<string>>(
    new Set(editing?.campaignIds ?? []),
  );
  const [campaignQuery, setCampaignQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Campaigns visible in the campaign picker:
  // - if user has chosen accounts → show only campaigns from those accounts
  // - else → show all
  // - apply search filter
  const visibleCampaigns = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase();
    const hasAccountFilter = accountIds.size > 0;
    return campaigns
      .filter((c) => {
        if (hasAccountFilter && !accountIds.has(c.accountId)) return false;
        if (q && !c.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, 300);
  }, [campaigns, campaignQuery, accountIds]);

  function toggleAccount(id: string) {
    setAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCampaign(id: string) {
    setCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("ตั้งชื่อ scope ก่อน");
      return;
    }
    setSaving(true);
    const toastId = toast.loading("กำลังบันทึก...");
    try {
      const url = `/api/scopes?tenantSlug=${tenantSlug}`;
      const body = editing
        ? {
            id: editing.id,
            name: name.trim(),
            accountIds: Array.from(accountIds),
            campaignIds: Array.from(campaignIds),
          }
        : {
            name: name.trim(),
            accountIds: Array.from(accountIds),
            campaignIds: Array.from(campaignIds),
          };
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ");
      }
      toast.success("✓ บันทึก scope แล้ว", { id: toastId, duration: 2500 });
      onSaved(data.scope.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="grid max-h-[90vh] w-full max-w-3xl grid-rows-[auto_1fr_auto] gap-4 overflow-hidden rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">
              {editing ? "แก้ไข Scope" : "สร้าง Scope ใหม่"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              เลือกชุด ads accounts / campaigns ที่ต้องการให้ AI วิเคราะห์เฉพาะกลุ่ม —
              เว้นว่างทั้งสองส่วน = ทั้ง workspace
            </p>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid gap-4 overflow-hidden md:grid-cols-2">
          {/* Accounts column */}
          <section className="flex min-h-0 flex-col rounded-md border border-border">
            <header className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">
              Ad Accounts —{" "}
              <span className="text-muted-foreground">
                {accountIds.size === 0
                  ? "ทุก account (ไม่ filter)"
                  : `เลือก ${accountIds.size} / ${accounts.length}`}
              </span>
            </header>
            <div className="flex-1 overflow-y-auto">
              <ul className="divide-y divide-border">
                {accounts.map((a) => (
                  <li
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/20",
                      accountIds.has(a.id) && "bg-primary/5",
                    )}
                    onClick={() => toggleAccount(a.id)}
                  >
                    <input
                      type="checkbox"
                      checked={accountIds.has(a.id)}
                      onChange={() => toggleAccount(a.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="size-4 cursor-pointer"
                    />
                    <span className="truncate">{a.name}</span>
                    {a.business && (
                      <span className="ml-auto truncate text-[11px] text-muted-foreground">
                        {a.business}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Campaigns column */}
          <section className="flex min-h-0 flex-col rounded-md border border-border">
            <header className="space-y-2 border-b border-border bg-muted/30 px-3 py-2">
              <div className="text-xs font-medium">
                Campaigns —{" "}
                <span className="text-muted-foreground">
                  {campaignIds.size === 0
                    ? "ทุก campaign ใน accounts ที่เลือก"
                    : `เลือก ${campaignIds.size}`}
                </span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={campaignQuery}
                  onChange={(e) => setCampaignQuery(e.target.value)}
                  placeholder="ค้นหาชื่อ campaign..."
                  className="h-7 pl-7 text-xs"
                />
              </div>
            </header>
            <div className="flex-1 overflow-y-auto">
              {visibleCampaigns.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  ไม่มี campaign — ลองล้าง filter หรือเลือก accounts น้อยลง
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {visibleCampaigns.map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/20",
                        campaignIds.has(c.id) && "bg-primary/5",
                      )}
                      onClick={() => toggleCampaign(c.id)}
                      title={c.name}
                    >
                      <input
                        type="checkbox"
                        checked={campaignIds.has(c.id)}
                        onChange={() => toggleCampaign(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 cursor-pointer"
                      />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">
              ชื่อ scope
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น FROST, Asahi Q2, New Launches..."
              className="max-w-sm"
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {editing ? "บันทึกการแก้ไข" : "สร้าง scope"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

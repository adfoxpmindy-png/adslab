"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { objectiveLabelTh } from "@/lib/goals/meta-objective-map";

type GoalObjective =
  | "AWARENESS"
  | "ENGAGEMENT"
  | "TRAFFIC"
  | "LEADS"
  | "SALES"
  | "APP_PROMOTION"
  | "STORE_VISITS";

const OBJECTIVES: GoalObjective[] = [
  "AWARENESS",
  "ENGAGEMENT",
  "TRAFFIC",
  "LEADS",
  "SALES",
  "APP_PROMOTION",
  "STORE_VISITS",
];

type Rule = {
  id: string;
  pattern: string;
  isRegex: boolean;
  objective: GoalObjective;
  priority: number;
};

type Props = {
  tenantSlug: string;
  initialRules: Rule[];
  sampleCampaigns: { id: string; name: string }[];
  canEdit: boolean;
};

export function NamingRulesClient({
  tenantSlug,
  initialRules,
  sampleCampaigns,
  canEdit,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Draft for a new rule
  const [pattern, setPattern] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [objective, setObjective] = useState<GoalObjective>("AWARENESS");
  const [priority, setPriority] = useState(0);
  const [creating, setCreating] = useState(false);

  // Live preview: which sample campaigns match the draft pattern
  const previewMatches = useMemo(() => {
    if (!pattern.trim()) return [];
    if (isRegex) {
      try {
        const re = new RegExp(pattern, "i");
        return sampleCampaigns.filter((c) => re.test(c.name));
      } catch {
        return [];
      }
    }
    const q = pattern.toLowerCase();
    return sampleCampaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [pattern, isRegex, sampleCampaigns]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) {
      toast.error("กรอก pattern ก่อน");
      return;
    }
    setCreating(true);
    const toastId = toast.loading("กำลังเพิ่มกฎ...");
    try {
      const res = await fetch(`/api/naming-rules?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern, isRegex, objective, priority }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "เพิ่มไม่สำเร็จ");
      }
      toast.success("✓ เพิ่มกฎแล้ว", { id: toastId });
      setPattern("");
      setPriority(0);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ", { id: toastId });
    } finally {
      setCreating(false);
    }
  }

  async function deleteRule(id: string) {
    if (!confirm("ลบกฎนี้?")) return;
    const toastId = toast.loading("กำลังลบ...");
    try {
      const res = await fetch(`/api/naming-rules?tenantSlug=${tenantSlug}&id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("ลบไม่สำเร็จ");
      toast.success("✓ ลบแล้ว", { id: toastId });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ", { id: toastId });
    }
  }

  async function adjustPriority(rule: Rule, delta: number) {
    const next = Math.max(0, Math.min(1000, rule.priority + delta));
    if (next === rule.priority) return;
    try {
      const res = await fetch(`/api/naming-rules?tenantSlug=${tenantSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, priority: next }),
      });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      toast.error("ปรับลำดับไม่สำเร็จ");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: existing rules + add-new form spans 2 cols */}
      <div className="space-y-4 lg:col-span-2">
        {canEdit && (
          <Card className="px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold">เพิ่มกฎใหม่</h2>
            <form onSubmit={createRule} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Pattern (substring หรือ regex)
                  </label>
                  <Input
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder={isRegex ? "^awareness_|^aw_" : "awareness"}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Objective
                  </label>
                  <select
                    value={objective}
                    onChange={(e) => setObjective(e.target.value as GoalObjective)}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {OBJECTIVES.map((o) => (
                      <option key={o} value={o}>
                        {objectiveLabelTh(o)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Priority
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-20"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isRegex}
                    onChange={(e) => setIsRegex(e.target.checked)}
                    className="size-4"
                  />
                  ใช้ regex
                </label>
                <Button type="submit" disabled={creating} className="gap-2">
                  <Plus className="size-3.5" />
                  เพิ่มกฎ
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="p-0">
          <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
            กฎที่ใช้อยู่ ({initialRules.length}) — เรียงตาม priority สูงไปต่ำ
          </div>
          {initialRules.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              ยังไม่มีกฎ — เพิ่มกฎแรกข้างบน
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {initialRules.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                >
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">
                      {r.priority}
                    </span>
                    {canEdit && (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => adjustPriority(r, 10)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ChevronUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustPriority(r, -10)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ChevronDown className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {r.pattern}
                    </code>
                    {r.isRegex && (
                      <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] uppercase text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                        regex
                      </span>
                    )}
                  </div>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {objectiveLabelTh(r.objective)}
                  </span>
                  {canEdit && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => deleteRule(r.id)}
                      title="ลบกฎ"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Right: live preview pane */}
      <Card className="h-fit p-0">
        <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          ตัวอย่างการแมตช์
          {pattern && (
            <span className="ml-2 text-foreground">
              {previewMatches.length} / {sampleCampaigns.length}
            </span>
          )}
        </div>
        {!pattern.trim() ? (
          <div className="py-8 px-4 text-center text-xs text-muted-foreground">
            พิมพ์ pattern ด้านซ้าย → จะดู campaign ที่แมตช์ที่นี่
          </div>
        ) : previewMatches.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-muted-foreground">
            ไม่มี campaign ใดใน 100 ตัวอย่างที่ตรงกับ pattern นี้
          </div>
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {previewMatches.slice(0, 50).map((c) => (
              <li
                key={c.id}
                className={cn("truncate px-4 py-1.5 text-xs", "hover:bg-muted/30")}
                title={c.name}
              >
                {c.name}
              </li>
            ))}
            {previewMatches.length > 50 && (
              <li className="px-4 py-1.5 text-xs italic text-muted-foreground">
                ... และอีก {previewMatches.length - 50}
              </li>
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}

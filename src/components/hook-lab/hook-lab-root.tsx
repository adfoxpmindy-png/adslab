"use client";

import { useState } from "react";
import { RefreshCw, Search, Sparkles, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NickBanner } from "./nick-banner";
import { CostPill } from "./cost-pill";
import { GenerateForm } from "./generate-form";
import { IterateForm } from "./iterate-form";
import { AnalyzeForm } from "./analyze-form";
import { VisualPlannerForm } from "./visual-planner-form";
import { ConceptBoard } from "./concept-board";
import { MetaSignalsRail } from "./meta-signals-rail";
import type {
  HookConceptShape,
  HookProfileShape,
  HookWinnerShape,
} from "@/lib/hooks/types";

type Mode = "generate" | "iterate" | "analyze" | "visuals";

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  initialProfile: HookProfileShape | null;
  initialWinners: HookWinnerShape[];
  initialConcepts: HookConceptShape[];
};

export function HookLabRoot({
  tenantSlug,
  canEdit,
  initialProfile,
  initialWinners,
  initialConcepts,
}: Props) {
  const t = useTranslations("pages.hookLab");
  const tTabs = useTranslations("pages.hookLab.tabs");

  const [mode, setMode] = useState<Mode>("generate");
  const [winners, setWinners] = useState<HookWinnerShape[]>(initialWinners);
  const [concepts, setConcepts] =
    useState<HookConceptShape[]>(initialConcepts);
  const [detecting, setDetecting] = useState(false);

  const savedWinnerConcepts = concepts.filter((c) => c.status === "winner");
  const primaryCampaignId = winners[0]?.metaCampaignId ?? null;

  const upsertConcepts = (fresh: HookConceptShape[]) => {
    setConcepts((prev) => {
      const seen = new Set(fresh.map((c) => c.id));
      return [...fresh, ...prev.filter((c) => !seen.has(c.id))].slice(0, 200);
    });
  };

  const detectWinners = async () => {
    setDetecting(true);
    const callDetect = async (force: boolean) =>
      fetch("/api/ai/hooks/meta/detect-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, force }),
      });
    const applyResult = (json: {
      winners: HookWinnerShape[];
      fromCache: boolean;
    }) => {
      setWinners(json.winners);
      toast.success(
        json.fromCache
          ? t("winnerCacheHit", { n: json.winners.length })
          : t("winnerDetected", { n: json.winners.length }),
      );
    };
    try {
      const res = await callDetect(true);
      if (res.status === 202) {
        toast.info(t("winnerDetectionQueued"));
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise((r) => setTimeout(r, 15_000));
          const poll = await callDetect(false);
          if (poll.status === 202) continue;
          if (!poll.ok) throw new Error(String(poll.status));
          const json = (await poll.json()) as {
            winners: HookWinnerShape[];
            fromCache: boolean;
          };
          applyResult(json);
          return;
        }
        toast.error(t("winnerDetectFail", { message: "timeout" }));
      } else if (!res.ok) {
        throw new Error(String(res.status));
      } else {
        const json = (await res.json()) as {
          winners: HookWinnerShape[];
          fromCache: boolean;
        };
        applyResult(json);
      }
    } catch (err) {
      toast.error(
        t("winnerDetectFail", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setDetecting(false);
    }
  };

  const modes: Array<{ key: Mode; label: string; icon: typeof Sparkles }> = [
    { key: "generate", label: tTabs("generate"), icon: Sparkles },
    { key: "iterate", label: tTabs("iterate"), icon: RefreshCw },
    { key: "analyze", label: tTabs("analyze"), icon: Search },
    { key: "visuals", label: tTabs("visuals"), icon: Wand2 },
  ];

  return (
    <div className="space-y-4">
      <NickBanner />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
          role="tablist"
        >
          {modes.map((m) => {
            const active = mode === m.key;
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(m.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <CostPill tenantSlug={tenantSlug} />
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              disabled={detecting}
              onClick={detectWinners}
            >
              {detecting ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {t("refreshWinners")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {mode === "generate" && (
            <GenerateForm
              tenantSlug={tenantSlug}
              canEdit={canEdit}
              profile={initialProfile}
              winners={winners}
              onConceptsGenerated={upsertConcepts}
            />
          )}
          {mode === "iterate" && (
            <IterateForm
              tenantSlug={tenantSlug}
              canEdit={canEdit}
              winners={winners}
              savedWinners={savedWinnerConcepts}
              onIterationsGenerated={upsertConcepts}
            />
          )}
          {mode === "analyze" && (
            <AnalyzeForm
              tenantSlug={tenantSlug}
              canEdit={canEdit}
              winners={winners}
            />
          )}
          {mode === "visuals" && (
            <VisualPlannerForm tenantSlug={tenantSlug} canEdit={canEdit} />
          )}
        </div>

        <div className="hidden xl:block">
          <MetaSignalsRail
            tenantSlug={tenantSlug}
            metaCampaignId={primaryCampaignId}
          />
        </div>
      </div>

      <ConceptBoard
        tenantSlug={tenantSlug}
        canEdit={canEdit}
        concepts={concepts}
        onChanged={setConcepts}
      />
    </div>
  );
}

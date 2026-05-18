"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Compass, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { layoutGraph } from "@/lib/journey/layout";
import type { JourneyGraph, JourneyNode } from "@/lib/journey/types";

import { AnimatedBeamEdge } from "./beam-edge";
import {
  BrandNode,
  CampaignNode,
  ConversionGoalNode,
  PostNode,
} from "./nodes";
import { JourneyDetailDrawer } from "./detail-drawer";

const NODE_TYPES = {
  post: PostNode,
  brand: BrandNode,
  conversion: ConversionGoalNode,
  campaign: CampaignNode,
};

const EDGE_TYPES = {
  beam: AnimatedBeamEdge,
};

type Mode = "overview" | "drilldown";
type Range = "today" | "yesterday" | "last_7d" | "last_30d";

const LOCALE_MAP: Record<string, string> = {
  th: "th-TH",
  en: "en-US",
  lo: "lo-LA",
};

export function JourneyCanvas({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("common.journey");
  const locale = useLocale();
  const intlLocale = LOCALE_MAP[locale] ?? "en-US";
  const [graph, setGraph] = useState<JourneyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("overview");
  const [range, setRange] = useState<Range>("last_30d");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drillCampaignId, setDrillCampaignId] = useState<string | null>(null);

  // Load graph
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-then-setState pattern, guarded with cancelled flag
    setLoading(true);
    const params = new URLSearchParams({ tenantSlug, mode, range });
    if (mode === "drilldown" && drillCampaignId) {
      params.set("campaignId", drillCampaignId);
    }
    fetch(`/api/journey?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          toast.error(typeof d.error === "string" ? d.error : t("loadFailed"));
          setGraph(null);
        } else {
          setGraph(d.graph);
        }
      })
      .catch(() => {
        if (!cancelled) setGraph(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, mode, range, drillCampaignId, t]);

  // Compose React Flow nodes/edges from the graph
  const { rfNodes, rfEdges, selectedNode } = useMemo(() => {
    if (!graph) {
      return { rfNodes: [] as Node[], rfEdges: [] as Edge[], selectedNode: null };
    }
    const positions = layoutGraph(graph.nodes, graph.edges);
    const posById = new Map(positions.map((p) => [p.id, p]));

    const rfNodes: Node[] = graph.nodes.map((n) => {
      const pos = posById.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        type: n.kind,
        position: { x: pos.x, y: pos.y },
        data: { node: n },
        draggable: true,
      };
    });

    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "beam",
      data: { spend: e.spend, stage: e.stage },
      animated: false, // we do the animation manually inside AnimatedBeamEdge
    }));

    const selectedNode: JourneyNode | null = selectedNodeId
      ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;

    return { rfNodes, rfEdges, selectedNode };
  }, [graph, selectedNodeId]);

  // Campaign options for drilldown picker
  const campaignOptions = useMemo(() => {
    if (!graph) return [];
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const n of graph.nodes) {
      if (n.kind === "post" && !seen.has(n.postId)) {
        seen.add(n.postId);
        out.push({ id: n.postId, label: n.label });
      }
    }
    return out;
  }, [graph]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Toolbar */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex gap-1 rounded-md border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("overview");
              setDrillCampaignId(null);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setMode("drilldown")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "drilldown"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Drill-in
          </button>
        </div>

        {mode === "drilldown" && (
          <select
            value={drillCampaignId ?? ""}
            onChange={(e) => setDrillCampaignId(e.target.value || null)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">{t("selectCampaign")}</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}

        <select
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="today">{t("rangeToday")}</option>
          <option value="yesterday">{t("rangeYesterday")}</option>
          <option value="last_7d">{t("range7d")}</option>
          <option value="last_30d">{t("range30d")}</option>
        </select>

        {graph && (
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </span>
            <span className="text-muted-foreground">
              {t("spend")}: <span className="font-semibold text-foreground">
                ฿{Intl.NumberFormat(intlLocale).format(Math.round(graph.totalSpendThb))}
              </span>
            </span>
          </div>
        )}
      </Card>

      {/* Canvas */}
      <Card className="relative min-h-0 flex-1 overflow-hidden p-0">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("drawing")}</span>
          </div>
        ) : !graph || graph.nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Compass className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t("emptyTitle")}</p>
            <p className="max-w-md text-xs text-muted-foreground">{t("emptyHint")}</p>
            <Button size="sm" variant="outline" onClick={() => setRange("last_30d")}>
              {t("try30d")}
            </Button>
          </div>
        ) : (
          <>
            <SkyBackground />
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              {/* Skip React Flow's default dot grid — we have a richer
                  game-style background painted behind the canvas. */}
              <Controls className="!bg-background/80 !shadow-md" />
              <MiniMap
                className="!bg-background/80"
                nodeStrokeWidth={2}
                pannable
                zoomable
                maskColor="rgba(0,0,0,0.15)"
              />
            </ReactFlow>
          </>
        )}
      </Card>

      {selectedNode && (
        <JourneyDetailDrawer
          tenantSlug={tenantSlug}
          node={selectedNode}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

/**
 * Soft sky/snow gradient overlay sitting behind React Flow. Pure CSS,
 * no library — gives the "game-map" vibe without compromising perf.
 */
/**
 * Game-world background layer — sits behind React Flow.
 *
 * Goal: evoke the Tower-War snowy archipelago without 3rd-party assets.
 * Built from layered CSS-only pieces:
 *   - Vivid sky gradient (sunrise → daylight → frosted teal)
 *   - Radial vignette to push focus inward
 *   - SVG cloud/snow puffs (decorative, varied sizes)
 *   - Tiny floating "stars" with stagger animations
 *   - Subtle white grain overlay for paper-game texture
 */
function SkyBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Main vivid gradient — light vs dark mode each get their own palette */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-cyan-50 to-emerald-100/80 dark:from-indigo-950 dark:via-slate-900 dark:to-emerald-950" />

      {/* Radial vignette — focus eye on center of canvas */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.12) 100%)",
        }}
      />

      {/* Decorative SVG clouds — float around, varying scale */}
      <svg
        className="absolute inset-0 size-full opacity-70 dark:opacity-25"
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="cloud-grad" cx="50%" cy="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.95" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Cluster 1 — top left */}
        <ellipse cx="120" cy="80" rx="90" ry="32" fill="url(#cloud-grad)" />
        <ellipse cx="180" cy="100" rx="70" ry="26" fill="url(#cloud-grad)" />
        {/* Cluster 2 — top right */}
        <ellipse cx="850" cy="60" rx="110" ry="38" fill="url(#cloud-grad)" />
        <ellipse cx="790" cy="90" rx="60" ry="22" fill="url(#cloud-grad)" />
        {/* Cluster 3 — middle right */}
        <ellipse cx="920" cy="280" rx="80" ry="28" fill="url(#cloud-grad)" />
        {/* Cluster 4 — bottom left */}
        <ellipse cx="100" cy="500" rx="120" ry="40" fill="url(#cloud-grad)" />
        <ellipse cx="180" cy="530" rx="80" ry="26" fill="url(#cloud-grad)" />
        {/* Cluster 5 — bottom center far */}
        <ellipse cx="500" cy="560" rx="160" ry="32" fill="url(#cloud-grad)" />
      </svg>

      {/* Twinkling stars/snow — staggered float animation */}
      <div className="absolute inset-0">
        {STAR_POSITIONS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.6)] journey-float"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
              opacity: s.opacity,
            }}
          />
        ))}
      </div>

      {/* Grain overlay for that hand-drawn game vibe */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

const STAR_POSITIONS = [
  { left: "8%", top: "12%", size: 6, opacity: 0.9, delay: "0s" },
  { left: "22%", top: "32%", size: 4, opacity: 0.7, delay: "0.6s" },
  { left: "15%", top: "65%", size: 5, opacity: 0.8, delay: "1.2s" },
  { left: "38%", top: "18%", size: 3, opacity: 0.6, delay: "1.8s" },
  { left: "52%", top: "8%", size: 5, opacity: 0.8, delay: "2.4s" },
  { left: "66%", top: "28%", size: 4, opacity: 0.7, delay: "3s" },
  { left: "78%", top: "12%", size: 6, opacity: 0.9, delay: "0.4s" },
  { left: "92%", top: "38%", size: 4, opacity: 0.7, delay: "1.6s" },
  { left: "12%", top: "82%", size: 5, opacity: 0.7, delay: "2.2s" },
  { left: "44%", top: "78%", size: 4, opacity: 0.6, delay: "2.8s" },
  { left: "72%", top: "85%", size: 6, opacity: 0.8, delay: "0.8s" },
  { left: "88%", top: "72%", size: 4, opacity: 0.7, delay: "1.4s" },
];

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

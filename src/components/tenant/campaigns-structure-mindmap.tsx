"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Target, TrendingUp, Sparkles } from "lucide-react";

import type { CampaignRow } from "./campaigns-v2-client";
import { prettyObjective, bucketStatus } from "./campaigns-v2-client";

import "@xyflow/react/dist/style.css";

/**
 * Mind-map visualization for campaigns, grouped by objective. Matches
 * the design mockup where each objective is a central "hub" (circle)
 * and its campaigns radiate outward as cards.
 *
 * When Ad Set / Ad-level data is fetched in a follow-up, we can deepen
 * this to: Objective → Campaign → Ad Set → Ad. For now: 2-level.
 */

type Props = {
  rows: CampaignRow[];
};

const HUB_COLORS = [
  { from: "from-violet-500", to: "to-indigo-500" },
  { from: "from-blue-500", to: "to-violet-500" },
  { from: "from-pink-500", to: "to-rose-500" },
  { from: "from-emerald-500", to: "to-teal-500" },
  { from: "from-amber-500", to: "to-orange-500" },
  { from: "from-sky-500", to: "to-blue-500" },
] as const;

export function CampaignsStructureMindmap({ rows }: Props) {
  const { nodes, edges } = useMemo(() => buildGraph(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="grid h-[600px] place-items-center rounded-2xl border border-border bg-card shadow-card">
        <div className="text-sm text-muted-foreground">ไม่มีแคมเปญในขณะนี้</div>
      </div>
    );
  }

  return (
    <div className="h-[680px] overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ hub: HubNode, campaign: CampaignNode }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultEdgeOptions={{
          style: {
            stroke: "url(#mindmap-edge-grad)",
            strokeWidth: 1.5,
            strokeDasharray: "4 4",
          },
          animated: true,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <linearGradient id="mindmap-edge-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="oklch(0.58 0.20 270)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="oklch(0.72 0.18 340)" stopOpacity="0.4" />
            </linearGradient>
          </defs>
        </svg>
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="oklch(0.85 0.005 280)"
        />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" pannable zoomable />
      </ReactFlow>
    </div>
  );
}

// =============================================================================
// Graph builder
// =============================================================================

function buildGraph(rows: CampaignRow[]): { nodes: Node[]; edges: Edge[] } {
  // Group campaigns by objective. Campaigns with null objective land in "อื่นๆ" hub.
  const byObjective = new Map<string, CampaignRow[]>();
  for (const c of rows) {
    const key = c.metaObjective ?? "UNKNOWN";
    const list = byObjective.get(key) ?? [];
    list.push(c);
    byObjective.set(key, list);
  }

  const objectives = Array.from(byObjective.entries()).sort((a, b) => b[1].length - a[1].length);

  // Layout: place hubs evenly in a row, campaigns radially around each hub.
  const HUB_SPACING_X = 900;
  const HUB_RADIUS = 280;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  objectives.forEach(([objective, campaigns], hubIndex) => {
    const hubX = hubIndex * HUB_SPACING_X;
    const hubY = 0;
    const hubId = `hub-${objective}`;

    // Hub node (center)
    const colorIndex = hubIndex % HUB_COLORS.length;
    nodes.push({
      id: hubId,
      type: "hub",
      position: { x: hubX, y: hubY },
      data: {
        label: prettyObjective(objective),
        count: campaigns.length,
        color: HUB_COLORS[colorIndex],
      },
    });

    // Campaign nodes radially placed around the hub
    const n = campaigns.length;
    campaigns.forEach((c, i) => {
      // Angle distributed full circle; start at top
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = hubX + Math.cos(angle) * HUB_RADIUS;
      const y = hubY + Math.sin(angle) * HUB_RADIUS;
      const id = `c-${c.id}`;
      nodes.push({
        id,
        type: "campaign",
        position: { x, y },
        data: { campaign: c },
      });
      edges.push({
        id: `e-${hubId}-${id}`,
        source: hubId,
        target: id,
        type: "default",
      });
    });
  });

  return { nodes, edges };
}

// =============================================================================
// Custom nodes
// =============================================================================

type HubData = {
  label: string;
  count: number;
  color: (typeof HUB_COLORS)[number];
};

function HubNode({ data }: NodeProps) {
  const d = data as unknown as HubData;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div
        className={`flex size-32 flex-col items-center justify-center rounded-full bg-gradient-to-br ${d.color.from} ${d.color.to} text-white shadow-lg`}
      >
        <Target className="size-5" />
        <p className="mt-1.5 text-sm font-bold tracking-tight">{d.label}</p>
        <p className="text-[10px] opacity-80">{d.count} แคมเปญ</p>
      </div>
    </>
  );
}

type CampaignNodeData = {
  campaign: CampaignRow;
};

function CampaignNode({ data }: NodeProps) {
  const d = data as unknown as CampaignNodeData;
  const c = d.campaign;
  const isActive = bucketStatus(c.effectiveStatus) === "ACTIVE";

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div
        className={`flex w-[220px] flex-col gap-1.5 rounded-xl border bg-card p-3 shadow-card transition-shadow hover:shadow-card-hover ${
          isActive ? "border-border" : "border-dashed border-border opacity-70"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-violet-500" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            แคมเปญ
          </span>
        </div>
        <p
          className="line-clamp-2 text-xs font-semibold leading-snug text-foreground"
          title={c.name}
        >
          {c.name}
        </p>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendingUp className="size-2.5" />
            {c.metrics.roas > 0 ? `ROAS ${c.metrics.roas.toFixed(1)}x` : "no spend"}
          </span>
          <span className="text-[10px] font-medium tabular-nums text-foreground">
            ฿{Math.round(c.metrics.spend).toLocaleString("th-TH")}
          </span>
        </div>
      </div>
    </>
  );
}

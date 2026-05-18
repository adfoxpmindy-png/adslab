"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useLocale } from "next-intl";
import { Crown, Flag, Globe, Image as ImageIcon, Megaphone, Sparkles } from "lucide-react";

import { formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { JourneyNode } from "@/lib/journey/types";

/**
 * Custom React Flow nodes — built to feel like floating islands in a
 * game map. Visual language:
 *   - elliptical "island base" with strong drop-shadow underneath
 *   - 3D bevel via stacked gradients
 *   - subtle journey-float keyframe so each island bobs
 *   - hover scales 1.05 and brightens shadow
 *   - handles are invisible — beams visually emerge from the island edge
 */

type NodeData = { node: JourneyNode };

const stageRing: Record<string, string> = {
  awareness: "ring-blue-400 dark:ring-blue-500",
  consideration: "ring-violet-400 dark:ring-violet-500",
  conversion: "ring-emerald-400 dark:ring-emerald-500",
};

const stageBg: Record<string, string> = {
  awareness:
    "from-blue-100 via-sky-50 to-blue-200 dark:from-blue-900/80 dark:via-blue-800/60 dark:to-sky-950/80",
  consideration:
    "from-violet-100 via-fuchsia-50 to-violet-200 dark:from-violet-900/80 dark:via-fuchsia-900/60 dark:to-violet-950/80",
  conversion:
    "from-emerald-100 via-teal-50 to-emerald-200 dark:from-emerald-900/80 dark:via-teal-900/60 dark:to-emerald-950/80",
};

const stageBeacon: Record<string, string> = {
  awareness: "shadow-[0_0_24px_4px_rgba(96,165,250,0.4)]",
  consideration: "shadow-[0_0_24px_4px_rgba(167,139,250,0.4)]",
  conversion: "shadow-[0_0_32px_8px_rgba(52,211,153,0.5)]",
};

/**
 * Floating-island base: rounded card with a soft elliptical drop-shadow
 * underneath that simulates the island casting a shadow on water.
 */
function IslandBase({
  children,
  ringClass,
  bgClass,
  glowClass,
  className,
}: {
  children: React.ReactNode;
  ringClass: string;
  bgClass: string;
  glowClass: string;
  className?: string;
}) {
  return (
    <div className="group/island relative">
      <div className="pointer-events-none absolute -bottom-3 left-1/2 h-4 w-[80%] -translate-x-1/2 rounded-[50%] bg-black/30 blur-md transition-opacity group-hover/island:bg-black/50" />
      <div
        className={cn(
          "relative rounded-3xl bg-gradient-to-b ring-4 transition-all journey-float",
          ringClass,
          bgClass,
          glowClass,
          "group-hover/island:scale-[1.05] group-hover/island:brightness-110",
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-x-3 top-1 h-3 rounded-full bg-white/40 blur-sm" />
        {children}
      </div>
    </div>
  );
}

export function PostNode({ data }: NodeProps) {
  const { node } = data as unknown as NodeData;
  if (node.kind !== "post") return null;
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <IslandBase
        ringClass={stageRing[node.stage]}
        bgClass={stageBg[node.stage]}
        glowClass={stageBeacon[node.stage]}
      >
        <div className="flex w-[200px] flex-col gap-1 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            <Megaphone className="size-3" />
            Campaign
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-inner ring-1 ring-black/10">
              {node.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={node.thumbnailUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <ImageIcon className="size-5 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-900 dark:text-slate-100"
                title={node.label}
              >
                {node.label}
              </p>
              <p className="mt-0.5 text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-400">
                {Intl.NumberFormat("en", { notation: "compact" }).format(node.reach)} reach ·{" "}
                {node.ctr.toFixed(1)}% CTR
              </p>
            </div>
          </div>
        </div>
      </IslandBase>
    </>
  );
}

export function ConversionGoalNode({ data }: NodeProps) {
  const { node } = data as unknown as NodeData;
  if (node.kind !== "conversion") return null;
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="group/island relative">
        <div className="pointer-events-none absolute inset-0 -m-6 rounded-full bg-emerald-300/50 blur-3xl animate-pulse" />
        <div className="pointer-events-none absolute -bottom-6 left-1/2 h-6 w-[80%] -translate-x-1/2 rounded-[50%] bg-black/40 blur-lg" />
        <div
          className={cn(
            "relative flex size-[240px] flex-col items-center justify-center rounded-full text-center text-white journey-float",
            "bg-gradient-to-b from-emerald-300 via-emerald-500 to-emerald-700",
            "shadow-[0_20px_60px_-10px_rgba(16,185,129,0.7)] ring-[6px] ring-emerald-300/40",
            "group-hover/island:scale-[1.04] transition-transform",
          )}
        >
          <div className="pointer-events-none absolute inset-x-6 top-2 h-6 rounded-full bg-white/40 blur-md" />
          <div className="relative flex flex-col items-center gap-1.5">
            <div className="rounded-full bg-amber-400 p-2 shadow-lg ring-2 ring-amber-300">
              <Crown className="size-7 text-amber-900" />
            </div>
            <p className="text-xl font-extrabold drop-shadow-md tracking-tight">
              {node.label}
            </p>
            <p className="flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold backdrop-blur-sm">
              <Flag className="size-3" />
              {Intl.NumberFormat("en").format(node.fires)} fires
            </p>
          </div>
          <Sparkles className="absolute -top-2 left-6 size-4 text-amber-300 drop-shadow journey-float" />
          <Sparkles
            className="absolute -bottom-2 right-8 size-3 text-amber-200 drop-shadow journey-float"
            style={{ animationDelay: "1.5s" }}
          />
        </div>
      </div>
    </>
  );
}

export function BrandNode({ data }: NodeProps) {
  const { node } = data as unknown as NodeData;
  if (node.kind !== "brand") return null;
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <IslandBase
        ringClass={stageRing[node.stage]}
        bgClass={stageBg[node.stage]}
        glowClass={stageBeacon[node.stage]}
      >
        <div className="flex size-[130px] flex-col items-center justify-center gap-1">
          {node.faviconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.faviconUrl} alt="" className="size-12 rounded-lg shadow ring-1 ring-black/10" />
          ) : (
            <Globe className="size-10 text-slate-500" />
          )}
          <p className="line-clamp-1 max-w-[110px] px-2 text-[11px] font-bold text-slate-800 dark:text-slate-200">
            {node.label}
          </p>
          <p className="text-[9px] font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {node.platform}
          </p>
        </div>
      </IslandBase>
    </>
  );
}

export function CampaignNode({ data }: NodeProps) {
  const locale = useLocale();
  const { node } = data as unknown as NodeData;
  if (node.kind !== "campaign") return null;
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <IslandBase
        ringClass={stageRing[node.stage]}
        bgClass={stageBg[node.stage]}
        glowClass={stageBeacon[node.stage]}
      >
        <div className="w-[180px] p-3">
          <p className="line-clamp-2 text-xs font-bold text-slate-900 dark:text-slate-100">
            {node.label}
          </p>
          <p className="mt-1 text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-400">
            ฿{formatNumber(node.spend, locale)}
          </p>
        </div>
      </IslandBase>
    </>
  );
}

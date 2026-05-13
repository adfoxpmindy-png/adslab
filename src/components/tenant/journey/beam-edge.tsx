"use client";

import { getBezierPath, type EdgeProps } from "@xyflow/react";

/**
 * Animated light-beam edge — the Tower-War "laser" between islands.
 *
 * Composition (drawn back-to-front):
 *   1. Glow rail (thick blurred stroke) — the soft halo
 *   2. Solid rail (thin, low opacity) — the path itself
 *   3. Animated dashes — flowing dashes traveling source → target
 *   4. Moving orb — a bright dot that rides the path repeatedly,
 *      reinforcing the "energy flowing toward the goal" direction
 */

const STAGE_COLOR = {
  awareness: { core: "#3b82f6", glow: "#60a5fa" },
  consideration: { core: "#8b5cf6", glow: "#a78bfa" },
  conversion: { core: "#10b981", glow: "#34d399" },
} as const;

type EdgePayload = {
  spend: number;
  stage: "awareness" | "consideration" | "conversion";
};

export function AnimatedBeamEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.35,
  });
  const payload = (data ?? { spend: 0, stage: "consideration" }) as unknown as EdgePayload;
  const stageColor = STAGE_COLOR[payload.stage] ?? STAGE_COLOR.consideration;

  // Thickness: log(spend) clamped 2.5-7. Zero-spend defaults to 2.
  const spend = Math.max(0, payload.spend);
  const strokeWidth =
    spend === 0
      ? 2
      : Math.min(7, Math.max(2.5, Math.log10(spend + 1) * 1.6));

  // Orb travel duration depends on path length proxy (distance).
  const dist = Math.hypot(targetX - sourceX, targetY - sourceY);
  const orbDur = Math.max(1.4, Math.min(3.5, dist / 400));

  return (
    <>
      {/* 1. Blurred glow rail — gives the laser halo */}
      <path
        d={edgePath}
        fill="none"
        stroke={stageColor.glow}
        strokeWidth={strokeWidth * 2.5}
        strokeLinecap="round"
        opacity={0.35}
        style={{ filter: "blur(6px)" }}
      />
      {/* 2. Solid rail underlay */}
      <path
        d={edgePath}
        fill="none"
        stroke={stageColor.glow}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.25}
      />
      {/* 3. Animated dashes flowing */}
      <path
        d={edgePath}
        id={`${id}-rail`}
        fill="none"
        stroke={stageColor.core}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray="8 14"
        style={{ filter: `drop-shadow(0 0 6px ${stageColor.glow})` }}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-44"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>
      {/* 4. Travelling orb — bright dot riding the curve */}
      <circle
        r={Math.max(3, strokeWidth * 0.8)}
        fill="#ffffff"
        style={{
          filter: `drop-shadow(0 0 8px ${stageColor.glow}) drop-shadow(0 0 14px ${stageColor.core})`,
        }}
      >
        <animateMotion dur={`${orbDur}s`} repeatCount="indefinite" rotate="auto">
          <mpath href={`#${id}-rail`} />
        </animateMotion>
      </circle>
    </>
  );
}

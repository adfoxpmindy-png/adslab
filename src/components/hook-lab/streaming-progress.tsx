"use client";

import { Loader2, Check } from "lucide-react";

/**
 * Compact vertical stage list for SSE progress. The parent passes
 * a list of stages + which is currently active/done.
 */
export type StreamingStage = {
  key: string;
  label: string;
  status: "pending" | "active" | "done";
};

export function StreamingProgress({ stages }: { stages: StreamingStage[] }) {
  return (
    <ol className="space-y-1.5">
      {stages.map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-xs">
          {s.status === "done" && (
            <Check className="size-3.5 text-teal-600" aria-hidden />
          )}
          {s.status === "active" && (
            <Loader2 className="size-3.5 animate-spin text-teal-600" aria-hidden />
          )}
          {s.status === "pending" && (
            <span
              className="size-2 rounded-full border border-muted-foreground/40"
              aria-hidden
            />
          )}
          <span
            className={
              s.status === "pending"
                ? "text-muted-foreground/70"
                : s.status === "active"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
            }
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

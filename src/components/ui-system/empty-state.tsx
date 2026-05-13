import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Friendly empty placeholder — shown when there's no data yet
 * (no campaigns, no audiences, no events fired). The mockups don't
 * include explicit empty states but new SaaS without good empty states
 * looks half-finished.
 *
 * Layout: icon (in tinted circle) → headline → 1-line description → CTA.
 */
export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <Icon className="size-6" />
        </div>
      )}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

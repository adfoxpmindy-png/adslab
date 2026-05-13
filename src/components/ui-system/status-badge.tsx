import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status pill — used in tables, cards, anywhere we need to communicate
 * the state of an entity. Soft pastel backgrounds, ~10px text, dot prefix
 * for at-a-glance scanning.
 */
const statusBadge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
  {
    variants: {
      variant: {
        active:
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        paused:
          "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
        closed:
          "bg-muted text-muted-foreground",
        warning:
          "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
        info:
          "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
        brand:
          "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
        destructive:
          "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
        neutral:
          "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
      },
      withDot: {
        true: "",
        false: "",
      },
    },
    defaultVariants: { variant: "neutral", withDot: true },
  },
);

const dotColor: Record<NonNullable<VariantProps<typeof statusBadge>["variant"]>, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  closed: "bg-slate-400",
  warning: "bg-orange-500",
  info: "bg-sky-500",
  brand: "bg-violet-500",
  destructive: "bg-red-500",
  neutral: "bg-slate-400",
};

export type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof statusBadge> & {
    children: React.ReactNode;
  };

export function StatusBadge({ children, variant, withDot = true, className, ...rest }: StatusBadgeProps) {
  const v = variant ?? "neutral";
  return (
    <span className={cn(statusBadge({ variant: v, withDot }), className)} {...rest}>
      {withDot && <span className={cn("size-1.5 rounded-full", dotColor[v])} aria-hidden />}
      {children}
    </span>
  );
}

import { cn } from "@/lib/utils";

/**
 * Page or section header. Used at the top of every dashboard page
 * (Overview, Campaigns, etc.) as well as within cards for sub-sections.
 *
 * Layout: title (bold) + optional subtitle (muted) on the left, optional
 * actions slot on the right. The actions slot is where you'd put a date
 * range picker, "Create" button, filter chips, etc.
 */
export type SectionHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Slot for right-aligned controls (date picker, buttons, etc.) */
  actions?: React.ReactNode;
  /** Header size — `page` for top-of-page (h1), `section` for inside cards (h2) */
  size?: "page" | "section";
  className?: string;
};

export function SectionHeader({
  title,
  subtitle,
  actions,
  size = "page",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {size === "page" ? (
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        ) : (
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        )}
        {subtitle && (
          <p className={cn("mt-1 text-muted-foreground", size === "page" ? "text-sm" : "text-xs")}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Hierarchical data table primitive. Renders a `<table>` with sticky
 * header + supports expandable rows (campaigns → ad sets → ads pattern
 * shown in mockup #4).
 *
 * Why a primitive instead of using <Table>? Because the mockup tables
 * have very specific style: zebra-free, dot status pills, monospace
 * currency columns, indented expand rows. Rather than override <Table>
 * in 5 places, we ship a custom primitive once.
 *
 * Usage:
 *   <DataTableShell>
 *     <DataTableHead>
 *       <DataTableHeadRow>
 *         <DataTableHeadCell>ชื่อ</DataTableHeadCell>
 *         <DataTableHeadCell>สถานะ</DataTableHeadCell>
 *       </DataTableHeadRow>
 *     </DataTableHead>
 *     <DataTableBody>
 *       <DataTableRow expandable defaultExpanded>
 *         <DataTableCell>Campaign A</DataTableCell>
 *         <DataTableCell>...</DataTableCell>
 *       </DataTableRow>
 *       <DataTableRow depth={1}>
 *         <DataTableCell>Ad Set 1</DataTableCell>
 *       </DataTableRow>
 *     </DataTableBody>
 *   </DataTableShell>
 */
export function DataTableShell({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-2xl border border-border bg-card shadow-card",
        className,
      )}
      {...rest}
    >
      <table className="w-full border-collapse text-sm">{rest.children}</table>
    </div>
  );
}

export function DataTableHead({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
}

export function DataTableHeadRow({ className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("", className)} {...rest} />;
}

export function DataTableHeadCell({ className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("px-4 py-3 text-left font-medium", className)} {...rest} />;
}

export function DataTableBody({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("", className)} {...rest} />;
}

export type DataTableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  /** Indentation level — 0 = root, 1 = child (Ad Set), 2 = grandchild (Ad). */
  depth?: 0 | 1 | 2;
  /** Show expand caret column on the left (only meaningful at depth 0). */
  expandable?: boolean;
  /** Controlled expansion state. */
  expanded?: boolean;
  onToggle?: () => void;
};

export function DataTableRow({
  depth = 0,
  expandable,
  expanded,
  onToggle,
  children,
  className,
  ...rest
}: DataTableRowProps) {
  // Bg tint per depth level — subtle indentation visual.
  const bg = depth === 0 ? "bg-card" : depth === 1 ? "bg-muted/20" : "bg-muted/40";
  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/30",
        bg,
        className,
      )}
      {...rest}
    >
      {expandable !== undefined && (
        <td className="w-9 pl-3">
          {expandable ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={cn("size-4 transition-transform", expanded && "rotate-90")}
              />
            </button>
          ) : (
            <span aria-hidden className="block size-6" />
          )}
        </td>
      )}
      {children}
    </tr>
  );
}

export function DataTableCell({
  className,
  numeric,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-foreground",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...rest}
    />
  );
}

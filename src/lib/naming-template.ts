/**
 * Naming template rendering + validation.
 *
 * Pattern uses {Placeholder} syntax. Recognized placeholders:
 *   {MM}     — 2-digit month  ("06")
 *   {YY}     — 2-digit year   ("26")
 *   {YYYY}   — 4-digit year   ("2026")
 *   {DD}     — 2-digit day    ("13")
 *   {Month}  — English short month name ("Jun")
 *   {Custom} — user-provided value (any literal)
 *
 * Unknown placeholders pass through literally (preserves `{whatever}`
 * the user typed for their own conventions).
 */

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type RenderContext = {
  /** Date used for date placeholders. Defaults to "now" in Bangkok. */
  date?: Date;
  /** Map of {Custom} → user-provided values (if multiple Custom slots). */
  custom?: Record<string, string>;
};

/**
 * Replace placeholders in a template with current date / custom values.
 *   pattern = "CPS_{MM}{YY}"  →  "CPS_0626"
 */
export function renderTemplate(pattern: string, ctx: RenderContext = {}): string {
  const d = ctx.date ?? new Date();
  // We bias to Bangkok timezone for date placeholders — most users are
  // running campaigns by Thai local time, not UTC.
  const bkk = toBangkokParts(d);
  return pattern.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => {
    switch (key) {
      case "MM":
        return String(bkk.month).padStart(2, "0");
      case "YY":
        return String(bkk.year % 100).padStart(2, "0");
      case "YYYY":
        return String(bkk.year);
      case "DD":
        return String(bkk.day).padStart(2, "0");
      case "Month":
        return MONTH_NAMES_SHORT[bkk.month - 1] ?? "???";
      case "Custom":
        return ctx.custom?.Custom ?? "{Custom}";
      default:
        // Allow user-named placeholders (e.g. {Region}) — fetch from
        // ctx.custom if provided, otherwise keep the literal `{X}`.
        if (ctx.custom && key in ctx.custom) return ctx.custom[key];
        return match;
    }
  });
}

/**
 * Convert a template into a RegExp that matches names produced by it.
 * Used for live validation in Campaign Builder ("does the typed name
 * conform to template X?").
 *
 *   "CPS_{MM}{YY}"  →  /^CPS_\d{2}\d{2}$/
 */
export function templateToRegex(pattern: string): RegExp {
  // Escape regex metacharacters in literal text, then substitute
  // placeholders with their character classes.
  let rx = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end === -1) {
        rx += escapeRegex(pattern.slice(i));
        break;
      }
      const key = pattern.slice(i + 1, end);
      rx += placeholderRegex(key);
      i = end + 1;
    } else {
      rx += escapeRegex(ch);
      i++;
    }
  }
  return new RegExp(`^${rx}$`);
}

function placeholderRegex(key: string): string {
  switch (key) {
    case "MM":
    case "YY":
    case "DD":
      return "\\d{2}";
    case "YYYY":
      return "\\d{4}";
    case "Month":
      return "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
    case "Custom":
      // Catch-all — must be at least 1 non-whitespace char
      return ".+?";
    default:
      return ".*?";
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toBangkokParts(d: Date): { year: number; month: number; day: number } {
  // Bangkok = UTC+7, no DST
  const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Detect repeated naming patterns from a list of campaign names. Group
 * names by skeleton (digits replaced with `#`) and return the most-used
 * skeletons. Useful for suggesting "you seem to use this template" in
 * Campaign Builder when the tenant has no explicit templates yet.
 */
export function detectPatternsFromNames(
  names: string[],
  minOccurrences = 2,
  limit = 5,
): { skeleton: string; count: number; examples: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const skeleton = n.replace(/\d/g, "#");
    const list = groups.get(skeleton) ?? [];
    list.push(n);
    groups.set(skeleton, list);
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length >= minOccurrences)
    .map(([skeleton, list]) => ({
      skeleton,
      count: list.length,
      examples: list.slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

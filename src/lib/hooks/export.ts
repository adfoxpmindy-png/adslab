/**
 * Pure export builders for Hook Lab concept bundles.
 *
 * Two output formats:
 *   - CSV  → one row per (concept x visualDirection) — flattened so the
 *            user can filter on visual attributes in Sheets/Excel.
 *   - MD   → one markdown file per concept, wrapped in a JSON-friendly
 *            manifest so the export route can either zip or return as a
 *            single .md file (per-user preference).
 *
 * No side effects — routes/services wire the result into an HTTP response.
 */

import type { HookConceptShape, VisualDirection } from "./types";

// ------------------------------------------------------------
// CSV
// ------------------------------------------------------------

const CSV_HEADERS = [
  "concept_id",
  "generation_id",
  "source",
  "parent_concept_id",
  "status",
  "created_at",
  "text_hook_th",
  "text_hook_en",
  "body_outline",
  "lever_changed",
  "hypothesis",
  "awareness_stage",
  "sophistication_stage",
  "avatar",
  "control_hook_text",
  "control_body_text",
  "alignment_score",
  "alignment_verdict",
  "visual_diff_verdict",
  "andromeda_risk",
  "andromeda_override_chosen",
  "notes",
  "meta_campaign_id",
  "meta_ad_set_id",
  "visual_index",
  "visual_name",
  "visual_description",
  "visual_shot_list",
  "visual_hypothesis",
  "visual_why_different",
  "visual_format",
  "visual_aspect_ratio",
  "visual_duration_sec",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str: string;
  if (typeof value === "string") str = value;
  else if (Array.isArray(value)) str = value.join(" | ");
  else str = String(value);
  // Quote when the field contains chars Excel/Sheets will otherwise mis-parse.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowForVisual(
  concept: HookConceptShape,
  visual: VisualDirection | null,
  visualIndex: number,
): string[] {
  return [
    concept.id,
    concept.generationId,
    concept.source,
    concept.parentConceptId ?? "",
    concept.status,
    concept.createdAt,
    concept.textHookTh ?? "",
    concept.textHookEn ?? "",
    concept.bodyOutline ?? "",
    concept.leverChanged ?? "",
    concept.hypothesis ?? "",
    concept.awarenessStage ?? "",
    concept.sophisticationStage === null ? "" : String(concept.sophisticationStage),
    concept.avatar ?? "",
    concept.controlHookText ?? "",
    concept.controlBodyText ?? "",
    concept.alignmentScore === null ? "" : String(concept.alignmentScore),
    concept.alignmentVerdict ?? "",
    concept.visualDiffVerdict ?? "",
    concept.andromedaRisk ?? "",
    concept.andromedaOverrideChosen ? "true" : "false",
    concept.notes ?? "",
    concept.metaCampaignId ?? "",
    concept.metaAdSetId ?? "",
    String(visualIndex),
    visual?.name ?? "",
    visual?.description ?? "",
    (visual?.shotList ?? []).join(" | "),
    visual?.hypothesis ?? "",
    visual?.whyDifferent ?? "",
    visual?.format ?? "",
    visual?.aspectRatio ?? "",
    visual?.durationSec === undefined || visual.durationSec === null
      ? ""
      : String(visual.durationSec),
  ].map(csvEscape);
}

/**
 * Flatten concept rows into CSV. Every concept produces at least one row;
 * concepts with N visualDirections produce N rows (visual_index 0..N-1) so
 * the CSV is Excel-pivot-friendly.
 */
export function buildConceptsCsv(concepts: HookConceptShape[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.join(","));
  for (const c of concepts) {
    const visuals = c.visualDirections ?? [];
    if (visuals.length === 0) {
      lines.push(rowForVisual(c, null, 0).join(","));
    } else {
      visuals.forEach((v, i) => {
        lines.push(rowForVisual(c, v, i).join(","));
      });
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ------------------------------------------------------------
// Markdown pack
// ------------------------------------------------------------

function mdEscape(s: string): string {
  // Minimal: escape pipe (breaks tables) + backslash-escape leading #.
  return s.replace(/\|/g, "\\|");
}

function conceptToMarkdown(concept: HookConceptShape): string {
  const lines: string[] = [];
  const title =
    concept.textHookTh ??
    concept.textHookEn ??
    `Concept ${concept.id.slice(-6)}`;
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- **Source:** ${concept.source}`);
  lines.push(`- **Status:** ${concept.status}`);
  lines.push(`- **Created:** ${concept.createdAt}`);
  if (concept.parentConceptId) {
    lines.push(`- **Parent concept:** \`${concept.parentConceptId}\``);
  }
  if (concept.leverChanged) {
    lines.push(`- **Lever changed:** ${concept.leverChanged}`);
  }
  if (concept.andromedaRisk) {
    const suffix = concept.andromedaOverrideChosen ? " (override chosen)" : "";
    lines.push(`- **Andromeda risk:** ${concept.andromedaRisk}${suffix}`);
  }
  if (concept.alignmentVerdict) {
    const score =
      concept.alignmentScore === null ? "" : ` (${concept.alignmentScore.toFixed(2)})`;
    lines.push(`- **Body-hook alignment:** ${concept.alignmentVerdict}${score}`);
  }
  lines.push("");

  if (concept.textHookTh) {
    lines.push("## Text hook — Thai");
    lines.push("");
    lines.push(mdEscape(concept.textHookTh));
    lines.push("");
  }
  if (concept.textHookEn) {
    lines.push("## Text hook — English");
    lines.push("");
    lines.push(mdEscape(concept.textHookEn));
    lines.push("");
  }

  if (concept.hypothesis) {
    lines.push("## Hypothesis");
    lines.push("");
    lines.push(mdEscape(concept.hypothesis));
    lines.push("");
  }

  if (concept.bodyOutline) {
    lines.push("## Body outline");
    lines.push("");
    lines.push(mdEscape(concept.bodyOutline));
    lines.push("");
  }

  if (concept.angleChange) {
    lines.push("## Angle change vs control");
    lines.push("");
    for (const [k, v] of Object.entries(concept.angleChange)) {
      if (v) lines.push(`- **${k}:** ${mdEscape(String(v))}`);
    }
    lines.push("");
  }

  if (concept.controlHookText || concept.controlBodyText) {
    lines.push("## Control (winner) reference");
    lines.push("");
    if (concept.controlHookText) {
      lines.push(`- **Hook:** ${mdEscape(concept.controlHookText)}`);
    }
    if (concept.controlBodyText) {
      lines.push(`- **Body:** ${mdEscape(concept.controlBodyText)}`);
    }
    lines.push("");
  }

  const visuals = concept.visualDirections ?? [];
  if (visuals.length > 0) {
    lines.push("## Visual directions");
    lines.push("");
    visuals.forEach((v, i) => {
      lines.push(`### ${i + 1}. ${mdEscape(v.name)}`);
      lines.push("");
      lines.push(mdEscape(v.description));
      lines.push("");
      if (v.shotList?.length) {
        lines.push("**Shot list:**");
        for (const shot of v.shotList) lines.push(`- ${mdEscape(shot)}`);
        lines.push("");
      }
      if (v.hypothesis) {
        lines.push(`**Hypothesis:** ${mdEscape(v.hypothesis)}`);
        lines.push("");
      }
      if (v.whyDifferent) {
        lines.push(`**Why different:** ${mdEscape(v.whyDifferent)}`);
        lines.push("");
      }
      const meta: string[] = [];
      if (v.format) meta.push(`format=${v.format}`);
      if (v.aspectRatio) meta.push(`aspect=${v.aspectRatio}`);
      if (v.durationSec !== undefined && v.durationSec !== null) {
        meta.push(`~${v.durationSec}s`);
      }
      if (meta.length > 0) {
        lines.push(`_${meta.join(" · ")}_`);
        lines.push("");
      }
    });
  }

  if (concept.citations && concept.citations.length > 0) {
    lines.push("## Nick citations");
    lines.push("");
    for (const cite of concept.citations) {
      const url = cite.url ? ` — ${cite.url}` : "";
      lines.push(`- **${mdEscape(cite.title)}** (chunk #${cite.ordinal})${url}`);
    }
    lines.push("");
  }

  if (concept.notes) {
    lines.push("## Notes");
    lines.push("");
    lines.push(mdEscape(concept.notes));
    lines.push("");
  }

  return lines.join("\n");
}

export interface MarkdownPackFile {
  filename: string;
  contents: string;
}

/** Slugified prefix for md pack filenames. */
function conceptSlug(concept: HookConceptShape): string {
  const raw =
    concept.textHookTh ??
    concept.textHookEn ??
    `concept-${concept.id.slice(-6)}`;
  const slug = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `concept-${concept.id.slice(-6)}`;
}

/**
 * Build the markdown pack as a list of {filename, contents} entries. The
 * export route decides whether to concatenate into one .md, zip, or wrap
 * in a JSON envelope. Filenames are deduped by suffixing an index.
 */
export function buildConceptsMarkdownPack(
  concepts: HookConceptShape[],
): MarkdownPackFile[] {
  const seen = new Map<string, number>();
  return concepts.map((c) => {
    const base = conceptSlug(c);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const filename = count === 0 ? `${base}.md` : `${base}-${count + 1}.md`;
    return { filename, contents: conceptToMarkdown(c) };
  });
}

/**
 * Simple "single-file" markdown pack — concatenated with page-break H1
 * separators. Used when the export route is asked for one download instead
 * of a zip.
 */
export function buildConceptsMarkdownSingleFile(
  concepts: HookConceptShape[],
): string {
  const parts = buildConceptsMarkdownPack(concepts).map((f) => f.contents);
  return parts.join("\n\n---\n\n");
}

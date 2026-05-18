/**
 * Parse a free-form Thai/English boost request into a structured
 * intent. Used by /api/boost/plan.
 *
 * Example input (verified against a real client message):
 *   บูสต์วีดีโอให้หน่อยครับ เป็น Views โพสละ 1250 บาท ให้จบพรุ่งนี้ 10.00 น.
 *   https://facebook.com/share/v/1AtdSLKovS/
 *   https://facebook.com/reel/2046794962859921
 *   ...
 *
 * Output (zod-validated):
 *   {
 *     budgetMode: "per_post",
 *     budgetThb: 1250,
 *     objectiveHint: "views",
 *     scheduleEndIso: "2026-05-15T03:00:00.000Z",  // 10:00 +07:00 → 03:00Z
 *     kpi: null,  // not specified in prompt — UI must ask
 *     purpose: null,
 *     notes: "..."
 *   }
 */
import { z } from "zod";
import { aiChat } from "./openrouter";

export const BoostKpiSchema = z.object({
  /** Metric the user cares about */
  type: z.enum(["views", "engagement", "clicks", "reach", "cpv", "cpe", "cpc", "cpm", "other"]),
  /** Target value, e.g. 10000 for "10k views" or 0.05 for "CPV ≤ 0.05" */
  target: z.number().positive().nullable(),
  /** Free-form unit/qualifier, e.g. "views", "ต่อคลิก" */
  unit: z.string().nullable(),
  /** Direction — "at_least" for "ให้ได้", "at_most" for "ไม่เกิน" */
  direction: z.enum(["at_least", "at_most"]).nullable(),
});

export const BoostIntentSchema = z.object({
  /** "per_post" | "total" — how to interpret budgetThb */
  budgetMode: z.enum(["per_post", "total"]),
  budgetThb: z.number().positive(),
  /** What the user wants Meta to optimize for. Maps to ad set optimization goal later. */
  objectiveHint: z
    .enum(["views", "engagement", "clicks", "conversions", "reach", "leads", "unknown"])
    .default("unknown"),
  /** End time as ISO 8601 (UTC). Null if not specified. */
  scheduleEndIso: z.string().datetime().nullable(),
  /** Start time — almost always now + safety margin; null means "use server default". */
  scheduleStartIso: z.string().datetime().nullable(),
  /** Parsed KPI, if user mentioned a target metric */
  kpi: BoostKpiSchema.nullable(),
  /** Free-form "why is this being boosted" */
  purpose: z.string().nullable(),
  /** Things the parser had to assume; surface to user in UI */
  assumptions: z.array(z.string()),
  /** Any general notes / extracted client name / etc. */
  notes: z.string(),
});

export type BoostKpi = z.infer<typeof BoostKpiSchema>;
export type BoostIntent = z.infer<typeof BoostIntentSchema>;

const SYSTEM_PROMPT = `You are AdsLab's boost-request parser for SE-Asia media buyers. The user pastes a free-form client message (usually in Thai, sometimes English or Lao) and you extract a structured plan.

For free-form string fields ("purpose", "assumptions[]", "notes"), respond in the same language as the input message (Thai → Thai, English → English, Lao → Lao). Structured fields (enums, numbers, ISO dates) follow the schema regardless.

Always reason in Bangkok local time (UTC+7). When the user says "พรุ่งนี้" or "วันนี้", interpret relative to the current Bangkok date provided in the user message.

Output STRICTLY valid JSON matching this shape, with no extra prose:

{
  "budgetMode": "per_post" | "total",
  "budgetThb": <number — strip "บาท", interpret "k"/"พัน" multiplier>,
  "objectiveHint": "views" | "engagement" | "clicks" | "conversions" | "reach" | "leads" | "unknown",
  "scheduleEndIso": <ISO 8601 UTC string, or null>,
  "scheduleStartIso": <ISO 8601 UTC string, or null>,
  "kpi": null | {
    "type": "views" | "engagement" | "clicks" | "reach" | "cpv" | "cpe" | "cpc" | "cpm" | "other",
    "target": <number or null>,
    "unit": <string or null>,
    "direction": "at_least" | "at_most" | null
  },
  "purpose": <string or null — free-form, only if user explicitly said why>,
  "assumptions": [<string>...],
  "notes": <string — short summary of what you understood>
}

Rules:
- "โพสละ N บาท" → budgetMode: "per_post", budgetThb: N
- "งบรวม N" or "ทั้งหมด N" → budgetMode: "total"
- If unclear, default to "per_post" and add an assumption "เราเข้าใจว่าเป็นบัดเจ็ตต่อโพส"
- "Views" or "ยอดวิว" → objectiveHint: "views"
- "Engagement" or "การมีส่วนร่วม" → "engagement"
- "คลิก" or "ทราฟฟิก" → "clicks"
- "ขาย" or "ซื้อ" or "Sales" → "conversions"
- "ให้จบ <time>" → scheduleEndIso; convert from Bangkok to UTC
- KPI is ONLY filled if user gave an explicit target (e.g. "ให้ได้ 10000 views", "CPV ไม่เกิน 0.5"). Otherwise null.
- Purpose is ONLY filled if user explicitly said why (e.g. "เพื่อ launch", "ทดสอบ creative"). Otherwise null.
- Do NOT extract URLs — the server handles that separately.

Output ONLY the JSON object. No markdown fences, no commentary.`;

function bangkokNow(): string {
  // Bangkok = UTC+7; render as "YYYY-MM-DD HH:mm" for prompt context
  const d = new Date();
  const bangkokMs = d.getTime() + 7 * 60 * 60 * 1000;
  const b = new Date(bangkokMs);
  const yyyy = b.getUTCFullYear();
  const mm = String(b.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(b.getUTCDate()).padStart(2, "0");
  const hh = String(b.getUTCHours()).padStart(2, "0");
  const mi = String(b.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export type ParseResult =
  | { ok: true; intent: BoostIntent; rawJson: string }
  | { ok: false; error: string; rawJson?: string };

export async function parseBoostPrompt(promptText: string): Promise<ParseResult> {
  const userMessage = `Current Bangkok time: ${bangkokNow()} (+07:00)

User message:
"""
${promptText}
"""`;

  let result;
  try {
    result = await aiChat({
      role: "analysis",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      temperature: 0,
      maxTokens: 800,
    });
  } catch (err) {
    return { ok: false, error: `AI call failed: ${(err as Error).message}` };
  }

  // Strip ``` fences just in case
  let raw = result.content.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${(err as Error).message}`, rawJson: raw };
  }

  const validated = BoostIntentSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      error: `schema mismatch: ${validated.error.message.slice(0, 200)}`,
      rawJson: raw,
    };
  }

  return { ok: true, intent: validated.data, rawJson: raw };
}

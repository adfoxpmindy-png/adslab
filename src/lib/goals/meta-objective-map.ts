import type { GoalObjective } from "@/generated/prisma/enums";

/**
 * Layer 1 of goal resolution: map a raw Meta objective string to one of
 * our canonical GoalObjective values. Meta has 30+ legacy + ODAX strings
 * across two API versions; we collapse them into 7 buckets that the AI
 * rubric understands.
 *
 * Returns `null` for unknown / unmappable objectives — those campaigns
 * fall through to Layer 2 (naming) or Layer 3 (manual).
 */
export function mapMetaObjective(raw: string | null | undefined): GoalObjective | null {
  if (!raw) return null;
  const v = raw.toUpperCase();

  // OUTCOME_AWARENESS family (ODAX) + legacy
  if (
    v === "OUTCOME_AWARENESS" ||
    v === "BRAND_AWARENESS" ||
    v === "REACH" ||
    v === "AWARENESS" ||
    v === "LOCAL_AWARENESS"
  ) {
    return "AWARENESS";
  }

  // OUTCOME_ENGAGEMENT family
  if (
    v === "OUTCOME_ENGAGEMENT" ||
    v === "POST_ENGAGEMENT" ||
    v === "PAGE_LIKES" ||
    v === "VIDEO_VIEWS" ||
    v === "EVENT_RESPONSES" ||
    v === "ENGAGEMENT"
  ) {
    return "ENGAGEMENT";
  }

  // OUTCOME_TRAFFIC family
  if (v === "OUTCOME_TRAFFIC" || v === "LINK_CLICKS" || v === "TRAFFIC") {
    return "TRAFFIC";
  }

  // OUTCOME_LEADS family — includes lead-gen forms + messaging
  if (
    v === "OUTCOME_LEADS" ||
    v === "LEAD_GENERATION" ||
    v === "MESSAGES" ||
    v === "MESSAGING" ||
    v === "LEADS"
  ) {
    return "LEADS";
  }

  // OUTCOME_SALES family — conversion-optimized
  if (
    v === "OUTCOME_SALES" ||
    v === "CONVERSIONS" ||
    v === "PRODUCT_CATALOG_SALES" ||
    v === "CATALOG_SALES" ||
    v === "SALES" ||
    v === "WEBSITE_CONVERSIONS"
  ) {
    return "SALES";
  }

  // OUTCOME_APP_PROMOTION family
  if (v === "OUTCOME_APP_PROMOTION" || v === "APP_INSTALLS" || v === "APP_PROMOTION") {
    return "APP_PROMOTION";
  }

  // Store visits (still its own objective in some regions)
  if (v === "STORE_VISITS" || v === "STORE_TRAFFIC") {
    return "STORE_VISITS";
  }

  return null;
}

/**
 * Human-readable Thai label for a GoalObjective. Used in UI + AI report
 * so the same vocabulary appears everywhere.
 */
export function objectiveLabelTh(objective: GoalObjective): string {
  switch (objective) {
    case "AWARENESS":
      return "Awareness (สร้างการรับรู้)";
    case "ENGAGEMENT":
      return "Engagement (มีส่วนร่วม)";
    case "TRAFFIC":
      return "Traffic (เข้าเว็บ/หน้า)";
    case "LEADS":
      return "Leads (เก็บ lead/แชท)";
    case "SALES":
      return "Sales (ซื้อ/Conversion)";
    case "APP_PROMOTION":
      return "App Promotion (ติดตั้งแอป)";
    case "STORE_VISITS":
      return "Store Visits (เดินเข้าหน้าร้าน)";
  }
}

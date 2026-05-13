import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import {
  createCampaignTree,
  type CallToActionType,
  type CreateInput,
  type MetaObjective,
  type SpecialAdCategory,
} from "@/lib/meta/campaign-create";

const objectives: [MetaObjective, ...MetaObjective[]] = [
  "OUTCOME_AWARENESS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_TRAFFIC",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_APP_PROMOTION",
];

const specialAdCats: [SpecialAdCategory, ...SpecialAdCategory[]] = [
  "NONE",
  "HOUSING",
  "EMPLOYMENT",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
];

const ctas: [CallToActionType, ...CallToActionType[]] = [
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "DOWNLOAD",
  "GET_OFFER",
  "CONTACT_US",
  "MESSAGE_PAGE",
  "ORDER_NOW",
];

const creativeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing_post"),
    postId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("new_image"),
    imageHash: z.string().min(1),
    primaryText: z.string().min(1).max(125),
    headline: z.string().max(40).optional(),
    description: z.string().max(30).optional(),
    linkUrl: z.string().url(),
    callToAction: z.enum(ctas),
  }),
]);

const bodySchema = z.object({
  metaAccountId: z.string().regex(/^act_/, "metaAccountId must start with act_"),
  campaignName: z.string().min(1).max(200),
  objective: z.enum(objectives),
  specialAdCategories: z.array(z.enum(specialAdCats)).default(["NONE"]),
  budgetMode: z.enum(["CBO", "ABO"]),
  campaignDailyBudget: z.number().positive().optional(),
  campaignLifetimeBudget: z.number().positive().optional(),
  adSetName: z.string().min(1).max(200),
  adSetDailyBudget: z.number().positive().optional(),
  adSetLifetimeBudget: z.number().positive().optional(),
  targeting: z.record(z.string(), z.unknown()),
  optimizationGoal: z.string().min(1),
  billingEvent: z.string().min(1),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  adName: z.string().min(1).max(200),
  pageId: z.string().min(1),
  pixelId: z.string().min(1).optional(),
  customEventType: z.string().min(1).max(60).optional(),
  customConversionId: z.string().min(1).optional(),
  initialStatus: z.enum(["PAUSED", "ACTIVE"]).default("PAUSED"),
  creative: creativeSchema,
});

/**
 * POST /api/meta/campaigns/create?tenantSlug=<slug>
 * Body: full wizard payload (validated by bodySchema).
 *
 * Creates the campaign tree (Campaign → Ad Set → Ad) in Meta as PAUSED
 * and syncs locally. Returns the new internal + Meta IDs.
 *
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  const input: CreateInput = {
    tenantId: tenant.id,
    userId: session.userId,
    metaAccountId: data.metaAccountId,
    campaignName: data.campaignName,
    objective: data.objective,
    specialAdCategories: data.specialAdCategories,
    budgetMode: data.budgetMode,
    campaignDailyBudget: data.campaignDailyBudget,
    campaignLifetimeBudget: data.campaignLifetimeBudget,
    adSetName: data.adSetName,
    adSetDailyBudget: data.adSetDailyBudget,
    adSetLifetimeBudget: data.adSetLifetimeBudget,
    targeting: data.targeting,
    optimizationGoal: data.optimizationGoal,
    billingEvent: data.billingEvent,
    startTime: data.startTime ? new Date(data.startTime) : undefined,
    endTime: data.endTime ? new Date(data.endTime) : undefined,
    adName: data.adName,
    pageId: data.pageId,
    pixelId: data.pixelId,
    customEventType: data.customEventType,
    customConversionId: data.customConversionId,
    initialStatus: data.initialStatus,
    creative: data.creative,
  };

  // Sanity check: pixel-based goals require pixelId + either
  // customEventType OR customConversionId. We reject early so Meta
  // doesn't blow up mid-tree.
  if (
    data.optimizationGoal === "OFFSITE_CONVERSIONS" ||
    data.optimizationGoal === "VALUE"
  ) {
    if (!data.pixelId) {
      return NextResponse.json(
        { error: "Conversion goal ต้องเลือก Pixel" },
        { status: 400 },
      );
    }
    if (!data.customEventType && !data.customConversionId) {
      return NextResponse.json(
        { error: "Conversion goal ต้องเลือก event หรือ Custom Conversion" },
        { status: 400 },
      );
    }
  }

  const result = await createCampaignTree(input);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        failedAt: result.failedAt,
        partial: result.partial,
        logId: result.logId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}

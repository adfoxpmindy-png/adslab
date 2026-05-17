/**
 * Ad-set-level actions: PAUSE / RESUME / SET_BUDGET.
 *
 * Mirrors `performCampaignAction` but for ad sets. Lightweight: no new
 * audit log table — the chat-layer `captureRecommendationFromToolCall`
 * already records intent into `AIRecommendation`, which is enough for
 * the learning loop. Direct UI / API access by humans is via Meta Ads
 * Manager, which has its own audit trail.
 *
 * Tenant ownership is verified through ad-set → campaign → connection.
 */
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";
import { invalidateDashboardCache } from "./dashboard-service";
import {
  MIN_BUDGET_THB,
  MAX_BUDGET_THB,
  thbToMinorUnits,
} from "./campaign-actions";

export type AdSetActionInput =
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | {
      type: "SET_BUDGET";
      /** Exactly one of these. Locked to whichever the ad set already uses. */
      dailyBudget?: number;
      lifetimeBudget?: number;
    };

export type PerformAdSetActionInput = {
  tenantId: string;
  userId: string;
  /** Either internal MetaAdSet.id OR the Meta digit id — caller can pass either; we resolve. */
  adSetId: string;
  action: AdSetActionInput;
};

export type PerformAdSetActionResult =
  | {
      ok: true;
      adSetId: string;
      adSetName: string;
      beforeStatus?: string | null;
      afterStatus?: string;
      beforeValue?: unknown;
      afterValue?: unknown;
    }
  | { ok: false; error: string };

export async function performAdSetAction(
  input: PerformAdSetActionInput,
): Promise<PerformAdSetActionResult> {
  // 1. Resolve ad set + verify tenant ownership through the parent chain.
  const adset = await prisma.metaAdSet.findFirst({
    where: {
      OR: [{ id: input.adSetId }, { metaAdSetId: input.adSetId }],
      campaign: { connection: { tenantId: input.tenantId } },
    },
    select: {
      id: true,
      metaAdSetId: true,
      name: true,
      effectiveStatus: true,
      configuredStatus: true,
      dailyBudget: true,
      lifetimeBudget: true,
      campaign: {
        select: {
          metaConnectionId: true,
        },
      },
    },
  });
  if (!adset) {
    return { ok: false, error: `Ad set ${input.adSetId} ไม่พบใน tenant นี้` };
  }

  // 2. Validate + build the Meta body.
  let metaBody: Record<string, unknown>;
  let beforeStatus: string | null = null;
  let afterStatus: string | undefined;
  let beforeValue: Record<string, unknown> | undefined;
  let afterValue: Record<string, unknown> | undefined;

  if (input.action.type === "PAUSE" || input.action.type === "RESUME") {
    beforeStatus = adset.configuredStatus ?? adset.effectiveStatus;
    afterStatus = input.action.type === "PAUSE" ? "PAUSED" : "ACTIVE";
    metaBody = { status: afterStatus };
  } else {
    const a = input.action;
    const isDaily = a.dailyBudget !== undefined;
    const isLifetime = a.lifetimeBudget !== undefined;
    if (isDaily === isLifetime) {
      return {
        ok: false,
        error: "ต้องระบุอย่างใดอย่างหนึ่ง: dailyBudget หรือ lifetimeBudget",
      };
    }
    if (adset.dailyBudget === null && adset.lifetimeBudget === null) {
      return {
        ok: false,
        error: "Ad set นี้ไม่มี budget ของตัวเอง — แก้ที่ campaign แทน (CBO)",
      };
    }
    if (isDaily && adset.dailyBudget === null) {
      return {
        ok: false,
        error: "Ad set นี้ใช้ lifetime budget อยู่ — แก้แบบ lifetime แทน",
      };
    }
    if (isLifetime && adset.lifetimeBudget === null) {
      return {
        ok: false,
        error: "Ad set นี้ใช้ daily budget อยู่ — แก้แบบ daily แทน",
      };
    }
    const thb = (isDaily ? a.dailyBudget : a.lifetimeBudget) as number;
    if (thb < MIN_BUDGET_THB) {
      return { ok: false, error: `Budget ต่ำกว่าขั้นต่ำ ฿${MIN_BUDGET_THB}` };
    }
    if (thb > MAX_BUDGET_THB) {
      return {
        ok: false,
        error: `Budget เกินเพดาน ฿${MAX_BUDGET_THB.toLocaleString()} — ตรวจสอบว่าใส่ตัวเลขถูกหรือไม่`,
      };
    }
    const minor = thbToMinorUnits(thb);
    beforeValue = {
      dailyBudget: adset.dailyBudget,
      lifetimeBudget: adset.lifetimeBudget,
    };
    afterValue = isDaily
      ? { dailyBudget: minor, lifetimeBudget: adset.lifetimeBudget }
      : { dailyBudget: adset.dailyBudget, lifetimeBudget: minor };
    metaBody = isDaily
      ? { daily_budget: String(minor) }
      : { lifetime_budget: String(minor) };
  }

  // 3. Fetch fresh token + call Meta.
  const connection = await prisma.metaConnection.findUnique({
    where: { id: adset.campaign.metaConnectionId },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection || connection.status !== "ACTIVE") {
    return {
      ok: false,
      error: `Meta connection not active (${connection?.status ?? "missing"})`,
    };
  }
  const accessToken = await getFreshAccessToken(connection);

  try {
    await graphFetch<{ success: boolean }>(`/${adset.metaAdSetId}`, {
      method: "POST",
      accessToken,
      body: metaBody,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // 4. Update local cache row.
  const cacheUpdate: Record<string, unknown> = {};
  if (afterStatus) cacheUpdate.configuredStatus = afterStatus;
  if (afterValue) {
    if ("dailyBudget" in afterValue) cacheUpdate.dailyBudget = afterValue.dailyBudget;
    if ("lifetimeBudget" in afterValue) cacheUpdate.lifetimeBudget = afterValue.lifetimeBudget;
  }
  await prisma.metaAdSet.update({
    where: { id: adset.id },
    data: cacheUpdate,
  });
  await invalidateDashboardCache(input.tenantId);

  return {
    ok: true,
    adSetId: adset.metaAdSetId,
    adSetName: adset.name,
    beforeStatus,
    afterStatus,
    beforeValue,
    afterValue,
  };
}
